'use strict';
'require form';
'require rpc';
'require ui';
'require view';

/*
 * 与后端的通道只有一条：rpcd 的 file.exec 调用 /usr/bin/cf-ipcheck。
 * 为什么不用 fs.read 读状态文件 —— 那样要额外授意 file.read，且各版本
 * 返回字段（data/buf）不一致；让脚本自己把 JSON 打到 stdout 更稳。
 * ACL 已在 root/usr/share/rpcd/acl.d/ 里放开了这个可执行文件的 exec。
 *
 * 页面状态一律以引擎给的 JSON 为准；拿不到 JSON 的三种情况（执行失败 /
 * 输出不是 JSON / 引擎自己报 error+reason）分开呈现，绝不能统一说成
 * 「本轮没有达标 IP」—— 那会把「压根没跑起来」说成「跑了但没结果」。
 */
var CMD = '/usr/bin/cf-ipcheck';

var callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: [ 'command', 'params' ],
	expect: { stdout: '' }
});

/* 模块级句柄：结果块每次刷新都会整块换掉新节点，定时器不能挂在它身上 */
var nodes = { table: null, srcHost: null };
var poll = null;
var inflight = null;

function execCfIpcheck(args) {
	/* 注意：expect:{stdout:''} 已经把 stdout 拆出来了，
	 * 这里 resolve 到的就是那段字符串本身，不是 {stdout:...} 对象。
	 * 真机上验过一次：写成 res.stdout 会永远拿到 undefined，
	 * 页面于是无论测没测过都显示「尚未运行过」。
	 *
	 * 反过来也一样要紧：调用**失败**（ACL 没放开、可执行文件不在、rpcd 超时）
	 * 时不能返回空串，否则跟「跑了但没结果」长得一模一样。所以失败给 null。
	 */
	return callExec(CMD, args).then(function (out) {
		if (typeof out !== 'string')
			return null;
		return out;
	}, function () {
		return null;
	});
}

function parseStatus(text) {
	if (text === null || text === undefined)
		return { state: 'unreachable', items: [] };
	if (!text)
		return { state: 'never_run', items: [] };
	try {
		var o = JSON.parse(text);
		if (!Array.isArray(o.items))
			o.items = [];
		// 出口被透明代理接管时，逐 IP 的数字没有意义（引擎每轮用保留地址自检）
		o.intercepted = (o.intercepted === 1 || o.intercepted === '1') ? 1 : 0;
		return o;
	} catch (e) {
		return { state: 'parse_error', items: [], raw: String(text) };
	}
}

/* 引擎 abort_round 写进 reason 的取值都在这里给出一句人话 + 下一步怎么办 */
function reasonText(reason) {
	switch (reason) {
		case 'empty_pool':
			return _('候选池是空的：社区源一条都没拉到，官方网段又关着。' +
				'先点下面「检测源可用性」看是不是哪些源改了路径，或临时打开「Cloudflare 官方网段」。');
		case 'missing_curl':
			return _('这台机器上没有 curl：所有探测都是 curl --resolve 发起的，请安装 curl 与 ca-bundle。');
		case 'interrupted':
			return _('上一轮没跑完就断了（进程被杀、断电或重启），运行锁已被回收，这一条是自动判出来的。' +
				'下面显示的是上一次成功完成的榜单；直接点「立即测速」即可重来。');
		case 'missing_bin':
			return _('找不到 %s：包没装好，或者 rpcd 还拿着旧的 ACL 缓存（/etc/init.d/rpcd restart 后重试）。').format(CMD);
		default:
			return _('引擎报告本轮失败') + (reason ? '（reason=%s）'.format(reason) : '');
	}
}

/* 顶部状态栏与表格内提示共用的状态文案 */
function stateLabel(st) {
	switch (st.state) {
		case 'running':
			return _('正在测速');
		case 'never_run':
			return _('从未运行');
		case 'error':
			return _('出错') + '：' + (st.reason || '?');
		case 'unreachable':
			return _('无法连接后端');
		case 'parse_error':
			return _('输出无法解析');
		default:
			return _('空闲');
	}
}

/* 各版本 LuCI 的提示接口不一致（老的 ui.toast(type,title,msg) 与新的
 * ui.addToast(title,msg,type)），这里按存在性挑一个；两个都没有就算了，
 * 状态一律还会写进页面本身，不靠提示传达。 */
function notify(title, message, type) {
	if (typeof ui.addToast === 'function')
		ui.addToast(title, message, type || 'info');
	else if (typeof ui.toast === 'function')
		ui.toast(type || 'info', title, message);
}

/* 表格内那一句：只回答「这张表为什么是空的」。
 * 失败原因的细节在上面那条 alert 里，两处不要重复同一段长文。 */
function emptyRowText(st) {
	switch (st.state) {
		case 'running':
			return _('正在测速，请稍候…（逐源进度可看 /tmp/cf-ipcheck/cf-ipcheck.log）');
		case 'never_run':
			return _('尚未运行过，点上方「立即测速」开始第一轮。');
		case 'unreachable':
			return _('无法执行 %s').format(CMD);
		case 'parse_error':
			return _('引擎输出不是合法 JSON');
		case 'error':
			return _('本轮中止（reason=%s）').format(st.reason || '?');
		default:
			return _('本轮没有达标 IP（可放宽 TTFB / 总耗时阈值，或检查探测域名是否真在 Cloudflare 后面）');
	}
}

/* 结果块顶部的提示条：只有「压根没跑出结果」与「结果不可信」才占一条 alert */
function noticeFor(st) {
	if (st.state === 'error')
		return E('div', { class: 'alert danger' }, [
			E('strong', {}, _('本轮中止：')), reasonText(st.reason)
		]);
	if (st.state === 'unreachable')
		return E('div', { class: 'alert danger' }, [
			E('strong', {}, _('后端不可用：')),
			_('拿不到任何输出。常见原因：包没装上、可执行位丢了（打包成 100644 的文件装进去就是 -rw-r--r--），' +
			  '或 rpcd 的 ACL 还没重载（%s）。').format('/etc/init.d/rpcd restart')
		]);
	if (st.state === 'parse_error')
		return E('div', { class: 'alert warning' }, [
			E('strong', {}, _('输出异常：')),
			_('%s 有输出，但不是合法 JSON。通常是引擎被改坏了或磁盘/内存不够中途截断。原文前 200 字：').format(CMD),
			E('pre', { class: 'mono' }, String(st.raw || '').slice(0, 200))
		]);
	if (st.intercepted == 1)
		return renderInterceptNotice();
	return '';
}

/* 接管警告条：这台机器上本机 443 会被 OpenClash 之类接管重拨，
 * 引擎用 RFC 5737 保留地址做 canary —— 保留地址本该连不上，
 * 一旦它回了状态码就说明 --resolve 钉的 IP 没参与选路。 */
function renderInterceptNotice() {
	return E('div', { class: 'alert danger' }, [
		E('strong', {}, _('出口被透明代理接管，本轮数字不可信：')),
		E('p', {}, _('引擎用保留地址 %s 做自检，它也拿到了 HTTP 响应 —— 说明本机发起的 443 被接管后由代理自己重新拨号，' +
			'%s 钉住的候选 IP 根本没参与选路。下面这张表量的是「本机 → 代理 → Cloudflare」，不是各候选 IP 的差异。')
			.format('203.0.113.77 / 198.51.100.77', 'curl --resolve')),
		E('p', {}, _('本机默认的处置是把探测降到 %s 身份发起（探测发起身份这一项）—— 透明代理的 mangle 链通常按 ' +
			'%s 豁免这个组，改完下一轮生效。真的绕不开时，就把结果上传到 Gist（见「Gist 上传」一节），' +
			'或把 %s 拷到没被接管的机器上跑一轮。')
			.format('nobody', 'meta skgid 65534 return', 'cf-ipcheck')),
		E('p', {}, _('接管期间引擎会自动跳过「落地机房」和「下载 MiB/s」两列：那两个数取的是代理自己的表现，' +
			'测了也是一整列相同的假数据。'))
	]);
}

function fmtMs(v) {
	if (v == null || isNaN(v))
		return '—';
	return Number(v).toFixed(1) + ' ms';
}

/* 吞吐列：没测/测失败时引擎给 null 或 "-"，显示成 —（不是 0.00，
 * 0.00 会被读成「这个 IP 很慢」，而实情是压根没连上） */
function fmtMibs(v) {
	if (v == null || v === '' || v === '-' || isNaN(v))
		return '—';
	return Number(v).toFixed(2);
}

/* 榜单里的域名种类：多于一个才值得单独一列 */
function domainKinds(items) {
	var seen = {}, n = 0;
	for (var i = 0; i < items.length; i++) {
		var d = items[i].domain;
		if (d && !(d in seen)) { seen[d] = 1; n++; }
	}
	return n;
}

/* 失败分类：引擎按 IP 统计（不是按 ip×域名），none 是达标数、不在这里报 */
function countsText(counts) {
	if (!counts || typeof counts !== 'object')
		return '';
	var parts = [];
	for (var k in counts) {
		if (!Object.prototype.hasOwnProperty.call(counts, k) || k === 'none')
			continue;
		parts.push('%s %s'.format(k, String(counts[k])));
	}
	return parts.length ? ' · ' + _('失败分类') + '：' + parts.join(' · ') : '';
}

/* 结果表：单独抽出来，按钮触发后只重画这一块，不整页闪 */
function renderTable(st) {
	var withDom = domainKinds(st.items) > 1;
	var head = [
		'#', _('IP 地址'), _('状态码'),
		_('TCP 握手'), _('TLS 握手'), _('TTFB'), _('总计'), _('落地机房'), _('下载 MiB/s')
	];
	if (withDom)
		head.push(_('胜出域名'));

	var tbody = E('tbody', {});

	if (!st.items.length) {
		tbody.appendChild(E('tr', {}, [
			E('td', { colspan: String(head.length), class: 'center' }, emptyRowText(st))
		]));
	} else {
		for (var i = 0; i < st.items.length; i++) {
			var it = st.items[i];
			var cols = [
				E('td', { class: 'left' }, String(i + 1)),
				E('td', { class: 'left mono' }, it.ip || '?'),
				E('td', { class: 'left' }, it.code != null ? String(it.code) : '—'),
				E('td', { class: 'left' }, fmtMs(it.connect_ms)),
				E('td', { class: 'left' }, fmtMs(it.tls_ms)),
				E('td', { class: 'left' }, fmtMs(it.ttfb_ms)),
				E('td', { class: 'left' }, fmtMs(it.total_ms)),
				E('td', { class: 'left' }, it.colo || '—'),
				E('td', { class: 'left' }, fmtMibs(it.speed_mibs))
			];
			if (withDom)
				cols.push(E('td', { class: 'left mono' }, it.domain || '—'));
			tbody.appendChild(E('tr', {}, cols));
		}
	}

	var meta = _('候选 %1$s 个 · 达标 %2$s 个 · 榜单 %5$s 条%6$s · 探测域名 %3$s · 完成于 %4$s')
		.replace('%1$s', st.pool != null ? st.pool : '—')
		.replace('%2$s', st.qualified != null ? st.qualified : (st.items || []).length)
		.replace('%5$s', st.usable != null ? st.usable : (st.items || []).length)
		.replace('%6$s', countsText(st.counts))
		.replace('%3$s', st.domains || '—')
		.replace('%4$s', st.finished || st.started || '—');

	return E('div', { class: 'cbi-section', id: 'cf-ipcheck-result' }, [
		E('div', { class: 'cbi-section-node' }, [
			noticeFor(st),
			E('p', { class: 'small' }, meta),
			E('div', { class: 'table cbi-section-table' }, [
				E('thead', {}, [
					E('tr', { class: 'tr table-titles' },
						head.map(function (t) {
							return E('th', { class: 'th' }, t);
						}))
				]),
				tbody
			]),
			E('p', { class: 'small' }, [
				E('abbr', { title: _('Time To First Byte，首字节时间') }, _('TTFB')),
				_(' 与其他四列的含义：TCP 握手 = 与对端完成三次连接；TLS 握手 = 从连上到 TLS 协商完成（含证书校验）；' +
				  'TTFB = 发出请求到收到第一个字节的耗时，代表「对端处理 + 回程」，是这几个指标里最贴近「打开页面快不快」的一个；' +
				  '总计 = 整个请求收尾。Cloudflare 是 anycast，同一个 IP 从不同线路会打到不同机房，' +
				  '所以 ICMP ping 再低也不说明代理能用 —— 只看这几段、且只看带真实 SNI 的 HTTPS 能否走通。' +
				  '排序按总计升序、同值再看 TTFB；total_limit 与 ttfb_limit 两道门槛都过才算达标。' +
				  '多域名时每个 IP 只留表现最好那次（连带那个域名），所以达标数不会超过候选池。' +
				  '「下载 MiB/s」是榜单出来后只对前若干个 IP 串行拉一次大文件测出来的吞吐 —— ' +
				  '延迟接近的 IP 吞吐可以差几十倍，但单次测量抖动大，所以只拿来参考、不参与排序；没测或测失败显示 —。')
			])
		])
	]);
}

function refreshResult() {
	/* 同一时刻只留一个 status 请求在飞，后来的直接共享它的结果：
	 * 两次刷新叠在一起会把 nodes.table 指向一个已经被替换掉的孤儿节点，
	 * 之后 replaceChild 找不到 parentNode，页面上那张表就再也不更新了。 */
	if (inflight)
		return inflight;

	inflight = execCfIpcheck(['status']).then(function (out) {
		inflight = null;
		var st = parseStatus(out);
		var next = renderTable(st);
		var old = nodes.table;
		if (old && old.parentNode)
			old.parentNode.replaceChild(next, old);
		nodes.table = next;
		return { node: next, state: st.state, intercepted: st.intercepted };
	}, function () {
		inflight = null;
		return { node: nodes.table, state: 'unknown' };
	});

	return inflight;
}

function stopPoll() {
	if (poll) {
		clearInterval(poll);
		poll = null;
	}
}

function startPoll() {
	/* 测速进行中每 5 秒拉一次；结束后停掉，避免白烧 CPU 和请求。
	 * 停止条件看 status 里的 state，不看 DOM 文案 —— 早先拿
	 * 「表格里有没有『正在测速』」判断，而那段文字在 <td> 里、
	 * 查的又是 <p>，第一次刷新就会把定时器关掉。
	 * 句柄放模块级：结果块每次刷新都被 replaceChild 换掉，挂在节点上
	 * 会把计时器丢在旧节点里，之后再也关不掉（离开页面就泄漏）。 */
	stopPoll();
	poll = setInterval(function () {
		refreshResult().then(function (r) {
			if (r.state !== 'running')
				stopPoll();
		}, function () {
			stopPoll();
		});
	}, 5000);
}

/* 源可用性检测：逐条 URL 看 HTTP 状态、提取到多少 IPv4、其中多少落在 CF 官方段内。
 * 后两列是收录标准 —— 段内占比掉下来就说明源换内容了（比如开始吐中转 IP）。 */
function renderSources(rows, why) {
	var head = [_('源 URL'), _('HTTP'), _('提取到 IPv4'), _('落在 CF 段内'), _('段内占比')];
	var tbody = E('tbody', {});

	if (!rows.length) {
		tbody.appendChild(E('tr', {}, [
			E('td', { colspan: String(head.length), class: 'center' },
				why || _('没有配置社区源'))
		]));
	}

	for (var i = 0; i < rows.length; i++) {
		var r = rows[i];
		var pct = (r.ips > 0 && r.cf_in >= 0) ? Math.round(100 * r.cf_in / r.ips) : null;
		var cls = 'left';
		if (r.url && String(r.url).charAt(0) === '#')
			cls = 'left danger';
		else if (r.http === '000' || !r.http || r.rc !== 0)
			cls = 'left warning';
		else if (pct != null && pct < 90)
			cls = 'left notice';
		tbody.appendChild(E('tr', { class: cls }, [
			E('td', { class: 'left mono' }, String(r.url || '')),
			E('td', { class: 'left' }, r.http ? String(r.http) : _('拉不到')),
			E('td', { class: 'left' }, String(r.ips != null ? r.ips : '—')),
			E('td', { class: 'left' }, r.cf_in < 0 ? '—' : String(r.cf_in)),
			E('td', { class: 'left' }, pct == null ? '—' : pct + ' %')
		]));
	}

	return E('div', { class: 'table cbi-section-table' }, [
		E('thead', {}, [E('tr', { class: 'tr table-titles' },
			head.map(function (t) { return E('th', { class: 'th' }, t); }))]),
		tbody
	]);
}

function checkSources(btn) {
	var host = nodes.srcHost;
	if (btn) {
		btn.disabled = true;
		btn.textContent = _('检测中…');
	}
	if (host)
		host.innerHTML = '<em>' + _('正在逐个拉取源并比对 Cloudflare 官方网段（最多十几秒）…') + '</em>';

	function done(out) {
		var kids = [];
		var rows = null;

		/* 三种「没有表格」的情况要分开说：执行失败、输出不是 JSON、源列表是空的。
		 * 一律写成「没有配置社区源」会把前两种掩盖成用户的配置问题。 */
		if (out === null) {
			kids.push(E('p', { class: 'small danger' },
				_('检测没跑成：无法执行 %s（包没装好、可执行位丢失，或 rpcd 的 file.exec 超时）。').format(CMD)));
		} else {
			try {
				rows = JSON.parse(out);
			} catch (e) {
				rows = null;
			}
			if (rows === null) {
				kids.push(E('p', { class: 'small danger' }, _('检测返回的内容不是合法 JSON。原文前 200 字：')));
				kids.push(E('pre', { class: 'mono' }, String(out).slice(0, 200)));
			} else if (!Array.isArray(rows) || !rows.length) {
				kids.push(E('p', { class: 'small danger' },
					_('一条源都没检出：「社区优选源 URL」这一项是空的。')));
			} else {
				kids.push(renderSources(rows));
			}
		}

		if (host) {
			host.innerHTML = '';
			for (var i = 0; i < kids.length; i++)
				host.appendChild(kids[i]);
		}
		if (btn) {
			btn.disabled = false;
			btn.textContent = _('重新检测');
		}
	}

	return execCfIpcheck(['check-sources']).then(done, function () {
		done(null);
	});
}

return view.extend({
	title: _('Cloudflare 优选 IP 实测'),

	load: function () {
		return execCfIpcheck(['status']);
	},

	render: function (raw) {
		var st = parseStatus(raw);

		/* ---- 按钮：先建节点、直接挂事件，再拼进操作条 ----
		 * 不走 getElementById + 重试那一套：这个视图的节点是 render() 返回之后
		 * 才进 DOM 的，靠 id 找就得赌时机（原先是 40 次 × 50ms）。拿着节点引用
		 * 绑事件跟 DOM 挂载时机彻底解耦，结果块重画也影响不到它们。 */
		var btnRun = E('button', {
			id: 'cf-ipcheck-run',
			class: 'cbi-button cbi-button-positive',
			type: 'button'
		}, _('立即测速'));

		var btnStop = E('button', {
			id: 'cf-ipcheck-stop',
			class: 'cbi-button',
			type: 'button'
		}, _('停止本轮'));

		var btnRefresh = E('button', {
			id: 'cf-ipcheck-refresh',
			class: 'cbi-button',
			type: 'button'
		}, _('刷新'));

		var btnCheck = E('button', {
			id: 'cf-ipcheck-check-sources',
			class: 'cbi-button',
			type: 'button'
		}, _('检测源可用性'));

		btnRun.onclick = function () {
			var self = this;
			self.disabled = true;
			execCfIpcheck(['run-now']).then(function (out) {
				self.disabled = false;
				if (out === null) {
					notify(_('无法启动'), _('执行 %s 失败：包没装好，或 rpcd 的 ACL 没放开 exec。').format(CMD), 'error');
					return;
				}
				notify(_('已启动一轮测速'), out);
				/* 无条件开始轮询，不看这一次读到的 state：run-now 只是把后台进程
				 * 甩出去，那一轮要几毫秒后才把 "running" 写进 status.json，
				 * 这里抢跑一次就可能读到上一轮的 "done"，于是永远没人启动轮询。 */
				refreshResult().then(function () { startPoll(); });
			}, function () {
				self.disabled = false;
			});
			return false;
		};

		btnStop.onclick = function () {
			execCfIpcheck(['stop']).then(function (out) {
				if (out === null)
					notify(_('无法请求停止'), _('执行 %s 失败。').format(CMD), 'error');
				else
					notify(_('已请求停止'), _('当前这轮收尾后不再继续探测'), 'warning');
				refreshResult();
			}, function () {
				notify(_('无法请求停止'), _('执行 %s 失败。').format(CMD), 'error');
			});
			return false;
		};

		btnRefresh.onclick = function () {
			refreshResult();
			return false;
		};

		btnCheck.onclick = function () {
			checkSources(this);
			return false;
		};

		/* ---- 顶部操作条 ---- */
		var bar = E('div', { class: 'cbi-section', id: 'cf-ipcheck-actions' }, [
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('状态')),
					E('div', { class: 'cbi-value-field' },
						E('em', {}, stateLabel(st) +
							(st.intercepted == 1 ? ' · ' + _('出口被接管，数字不可信') : '')))
				]),
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('操作')),
					E('div', { class: 'cbi-value-field' }, [
						btnRun, ' ', btnStop, ' ', btnRefresh
					])
				])
			])
		]);

		/* ---- 配置表单 ---- */
		var m = new form.Map('cf_ipcheck',
			_('Cloudflare 优选 IP 实测'),
			_('在你自己的线路上实测 Cloudflare 边缘 IP：判定口径是「带真实 SNI 的 HTTPS 探测成功（HTTP 2xx/3xx）」，' +
			  '而不是 ping —— Cloudflare 是 anycast，ICMP 延迟低不代表代理线路能用。'));

		var s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		var o;

		o = s.option(form.Flag, 'enabled', _('启用定时实测'),
			_('关闭时后台进程只空转不测速；打开后一分钟内开始下一轮，无需重启服务。'));
		o.rmempty = false;

		o = s.option(form.Value, 'interval_hours', _('定时周期（小时）'),
			_('一轮完整测速的间隔。候选池越大、超时越长，单轮耗时越久。'));
		o.datatype = 'and(uinteger,min(1))';
		o.default = '6';

		o = s.option(form.Value, 'probe_domains', _('探测域名'),
			_('逗号分隔。请填你**真正要用的那个域名**（EDT / Worker 节点域名最合适）：' +
			  '干扰是按 SNI 走的，同一个 IP 上 www.cloudflare.com 能通并不等于你的节点能通，' +
			  '反过来用节点域名测出来的榜单才是可直接应用的结果。' +
			  '域名必须架在 Cloudflare 后面（橙色云、CF 给它签了证书）；403 / 404 都算达标，' +
			  '判定只看「带真实 SNI 的 HTTPS 能否走通并拿到 HTTP 响应」，不看内容。' +
			  '探测时用 --resolve 把该域名钉到候选 IP 上，所以 SNI 与 Host 都是这个域名。' +
			  '填多个域名时，每个 IP 只保留它表现最好的那一次，榜单仍是一 IP 一行。'));
		o.default = 'www.cloudflare.com';

		o = s.option(form.Value, 'probe_port', _('探测端口'),
			_('一般保持 443；只有你要验非标准 HTTPS 端口时才改。'));
		o.datatype = 'port';
		o.default = '443';

		var src = m.section(form.TypedSection, 'global', _('候选池来源'));
		src.anonymous = true;

		o = src.option(form.Flag, 'use_official_ranges', _('Cloudflare 官方网段'),
			_('实时拉 api.cloudflare.com/client/v4/ips，把每个前缀按 /24 展开取样。默认关：' +
			  '官方段展开是近六千个候选，抽稀后仍会占掉大半名额，把别人已经优选好的地址挤出去。' +
			  '想扩大覆盖面（刚换线路、怀疑候选池老化）再打开，它会用剩余名额等间隔抽稀。' +
			  '比 /12 更宽的段会被丢掉（一条 0.0.0.0/0 就能把路由器撑爆）。'));
		o.rmempty = false;

		o = src.option(form.Flag, 'reuse_last', _('带上上一轮入围 IP'),
			_('把上次结果并回候选池，保证榜单连续、不会因为候选抖动而全换。'));
		o.rmempty = false;

		o = src.option(form.DynamicList, 'community_sources', _('社区优选源 URL'),
			_('每行一个 HTTPS 文本地址，IP / CIDR / IP:端口 都能提取（CIDR 按 /24 取样），' +
			  '注释、CSV 表头、IPv6 自动忽略；某个源拉不到只记日志，不影响本轮。' +
			  '默认十三条是 2026-09-27 逐个核过的：提取到的 IPv4 绝大多落在 Cloudflare 官方段内 —— ' +
			  '像 bestcf.pages.dev/random-region/mix.txt 那种 306 条全在段外的清单其实是别人的中转/VPS，' +
			  '不是 CF anycast，就没有收进来。这些列表只代表"别人线路上测出来不错"，' +
			  '在你这儿算不算好仍由本页实测说了算。名额分配：上一轮入围全保 → 社区源占剩下一半且逐源均分 → ' +
			  '官方网段抽稀填满其余。想看本轮实际会用哪些 IP，命令行跑 cf-ipcheck pool。'));

		var thr = m.section(form.TypedSection, 'global', _('测速与判定'));
		thr.anonymous = true;

		o = thr.option(form.Value, 'candidate_budget', _('单轮候选上限'),
			_('去重后最多探测多少个 IP。太大了会拉长单轮时间，也更容易触发运营商限速。'));
		o.datatype = 'and(uinteger,min(8),max(4096))';
		o.default = '256';

		o = thr.option(form.Value, 'concurrency', _('并发探测数'),
			_('同时探测的 IP 数。软路由上 8~16 比较稳。'));
		o.datatype = 'and(uinteger,min(1),max(64))';
		o.default = '8';

		o = thr.option(form.Value, 'probe_timeout', _('单 IP 超时（秒）'),
			_('同时作为 TCP 连接超时与整请求超时。'));
		o.datatype = 'and(uinteger,min(1),max(30))';
		o.default = '5';

		o = thr.option(form.Value, 'ttfb_limit', _('TTFB 上限（毫秒）'),
			_('TTFB = Time To First Byte，请求发出后收到第一个字节的耗时，代表「对端处理 + 回程」。' +
			  '它比 ping 的 RTT 更贴近实际体感：ping 只测到 ICMP 应答，而 anycast 下那个点未必是你会话真正落地的机房，' +
			  '也可能干脆不响应 ICMP；TTFB 则是这个 IP 上完整 TCP+TLS 走通之后，应用层第一次给出数据的时间。' +
			  '首字节慢通常意味着被调度到了远机房或链路拥塞，超过这个值直接判为不达标。'));
		o.datatype = 'and(uinteger,min(100))';
		o.default = '3000';

		o = thr.option(form.Value, 'total_limit', _('总耗时上限（毫秒）'),
			_('第二个门槛，与 TTFB 同时满足才算可用。'));
		o.datatype = 'and(uinteger,min(200))';
		o.default = '5000';

		o = thr.option(form.Value, 'keep_count', _('榜单保留条数'),
			_('排序按总耗时升序，同值再看 TTFB。'));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';

		o = thr.option(form.Flag, 'speed_probe', _('入围后再测下载速度'),
			_('延迟榜出来后，只对榜单前 speed_count 个 IP 串行拉一次大文件测 MiB/s。' +
			  '值得测：真机里三个 total 接近的 IP 吞吐差到 50 倍（10.1 / 3.4 / 0.18 MiB/s）。' +
			  '代价是流量，默认 10 × 10MB ≈ 每轮 100MB；不测就关掉，那一列显示 —。' +
			  '出口被接管那一轮会自动不测（测的是代理自己的速度）。'));
		o.rmempty = false;

		o = thr.option(form.Value, 'speed_count', _('测吞吐的 IP 个数'),
			_('只对榜单前 N 个测。这一项决定流量，N × speed_bytes 就是每轮的下载量。'));
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '10';

		o = thr.option(form.Value, 'speed_bytes', _('单次下载字节数'),
			_('默认 10MB（10485760 字节）。别调太小：1MB 样本主要落在 TCP 慢启动上，' +
			  '真机同一个 IP 两次测出 0.54 与 0.19 MiB/s，差 2.8 倍，排名会乱跳。'));
		o.datatype = 'and(uinteger,min(131072))';
		o.default = '10485760';

		o = thr.option(form.Value, 'speed_timeout', _('单次吞吐测试超时（秒）'),
			_('要单独给一个大一点超时：跨境拉 10MB 常在几秒到几十秒，' +
			  '复用「单 IP 超时」会把所有测量都截断掉。超时/失败的那一格显示 —，不会记成 0。'));
		o.datatype = 'and(uinteger,min(5),max(120))';
		o.default = '25';

		o = thr.option(form.Value, 'speed_domain', _('吞吐测试地址'),
			_('默认用 Cloudflare 自己的 speed.cloudflare.com/__down?bytes=N。' +
			  '它同样是用 --resolve 钉到候选 IP 上访问的，所以测的是那个 IP 的吞吐；' +
			  '换成你自己域名下的大文件也行（前提是该文件真在 CF 后面）。'));
		o.default = 'speed.cloudflare.com';

		o = thr.option(form.Flag, 'colo_probe', _('识别落地机房'),
			_('只对入围 IP 请求 cdn-cgi/trace 取 colo= 字段，多一次请求，用来确认 IP 实际打到哪个机房。'));
		o.rmempty = false;

		o = thr.option(form.Value, 'colo_domain', _('机房查询兜底域名'),
			_('/cdn-cgi/trace 要先用探测域名试；取不到（EDT / Worker 类节点域名常把这个路径拦成 403）' +
			  '就改用这里的域名 + 同一个候选 IP 再取一次，否则「落地机房」整列和注释里的 {colo} 都会变成 n/a。' +
			  '填一个确定架在 Cloudflare 后面、且不会拦截该路径的域名即可，一般不用改。'));
		o.default = 'www.cloudflare.com';

		o = thr.option(form.Flag, 'canary_check', _('每轮先自检出口是否被代理接管'),
			_('拿 RFC 5737 保留地址（203.0.113.77 / 198.51.100.77）按同一条探测路径试一次：' +
			  '保留地址全球不可路由，正常只会超时；一旦它返回任何 HTTP 状态码，就说明本机 443 被 ' +
			  'OpenClash 这类透明代理接管、由代理自己重新拨号，此时 --resolve 钉的候选 IP 没参与选路，' +
			  '榜单只是「本机 → 代理 → CF」的耗时。开启后本轮结果会被打标：页面红条提示，' +
			  '并且跳过「落地机房」与「下载 MiB/s」两列。每轮最多额外占用 2 次探测超时（默认 4 秒）。'));
		o.rmempty = false;

		o = thr.option(form.Value, 'probe_user', _('探测发起身份'),
			_('默认 nobody —— OpenClash 的 mangle 链第一条规则就是 meta skgid 65534 return，' +
			  '用 nobody 跑探测正好不被打 mark，量到的才是候选 IP 自己的握手；' +
			  'root 直发会被代理接管（实测同一个 IP：nobody 下 TCP 193ms，root 下 0.7ms，后者是假的）。' +
			  '家里没有透明代理、或就想按 root 测，把这里填成 none —— 注意不能留空或删掉这一项：' +
			  'uci 分不清「显式留空」和「没有这一项」，空值会被当成没设置、从而又落回 nobody。' +
			  '需要 su 支持，改动后下一轮生效。'));
		o.default = 'nobody';

		o = thr.option(form.Value, 'annotate', _('ip.txt 注释模板'),
			_('决定 %s（以及上传到 Gist 的那份）里每个 IP 后面那串字。整行格式固定是「IP:端口 注释」，' +
			  '注释会被去掉首尾空格；只填一个空格就等于「只要 IP:端口、不要注释」' +
			  '（这一项整个清空会被当成没设置，从而回到下面的默认模板 —— uci 分不清「显式留空」和「没这项」）。' +
			  '三个占位符：' +
			  '{colo} = 这个 IP 的落地机房代码，取自 cdn-cgi/trace 返回的 colo=（如 LAX / NRT / FRA），' +
			  '用来看同一批入围里哪些其实落到了不同机房；先用探测域名取，取不到再用「机房查询兜底域名」试一次，' +
			  '两处都取不到、或者本轮出口被接管才是 n/a。' +
			  '{total} = 这个 IP 的总耗时毫秒，就是排序用的那个数（保留一位小数）；' +
			  '把它记在文件里，是为了过几天换线路再测时能对比出差异 —— 此刻达标不代表下次还达标。' +
			  '{speed} = 实测下载速度 MiB/s（只对榜单前若干个 IP 测，没测到或关掉速度实测时是 -）。' +
			  '其余字符（含 & 和中文）原样输出，同一占位符可以写多次。' +
			  '默认模板渲染出来是：104.16.202.102:443 cf-ipcheck | LAX | 887.4ms')
			.format('/etc/cf-ipcheck/best-ip.txt'));
		o.default = 'cf-ipcheck | {colo} | {total}ms';

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

		o = gs.option(form.Flag, 'upload_gist', _('每轮结束后上传 ip.txt'),
			_('失败只记日志，不影响本地结果。'));
		o.rmempty = false;

		o = gs.option(form.Value, 'gist_id', _('Gist ID'),
			_('Gist 网址里那串十六进制 ID。需要先手工建一个 Gist。'));

		o = gs.option(form.Value, 'gist_file', _('Gist 文件名'),
			_('例如 cf-ip.txt —— PATCH 更新的是同名文件，名字不一致会在 Gist 里新增一份。'));
		o.default = 'cf-ip.txt';

		o = gs.option(form.Value, 'gist_token', _('GitHub Token'),
			_('直接写进 UCI（本机默认这条路）。清单内容只是优选 IP，泄露代价低，所以按 Ryan 的要求允许写在配置里；' +
			  '代价是它会随 sysupgrade 备份走、也在本页面回显，因此请只填**只勾选了 gist 权限**的经典令牌，' +
			  '不要用有 repo/workflow 权限的。填了这里就优先用它；留空则退回下面的 token_file。'));
		o.password = true;

		o = gs.option(form.Value, 'token_file', _('Token 文件路径（备选）'),
			_('不想把令牌写进配置就留空上面的字段，改从该文件读：' +
			  '在路由器上执行 printf "%s" "你的令牌" > /etc/cf-ipcheck.token 再 chmod 600 该文件即可。' +
			  '两处都填时以上面的 gist_token 为准。'));
		o.default = '/etc/cf-ipcheck.token';

		/* ---- 拼页面：操作条 + 结果表 + 源体检 + 表单 ---- *
		 * m.render() 给的是 Promise，不是节点：不能直接塞进返回数组里。
		 * 先把 Map 节点 resolve 出来，再拼成纯节点数组返回。
		 */
		nodes.table = renderTable(st);

		/* 源可用性检测：不自动跑（十来个源逐个拉太慢），点按钮才检测 */
		nodes.srcHost = E('div', { id: 'cf-ipcheck-sources-host' },
			E('p', { class: 'small' },
				_('逐条 URL 实拉一次，列出 HTTP 状态、提取到的 IPv4 数量，以及其中落在 Cloudflare 官方网段内的比例。' +
				  '段内占比掉到 90% 以下通常说明源改内容了（例如开始提供别人自己的中转 IP），' +
				  '拉不到的那条会标黄，引擎本轮会跳过它并记日志。')));

		var srccard = E('div', { class: 'cbi-section', id: 'cf-ipcheck-sources-card' }, [
			E('div', { class: 'cbi-section-node' }, [
				E('div', { class: 'cbi-value' }, [
					E('label', { class: 'cbi-value-title' }, _('源可用性检测')),
					E('div', { class: 'cbi-value-field' }, btnCheck)
				]),
				nodes.srcHost
			])
		]);

		var page = [bar, nodes.table, srccard];

		return m.render().then(function (mapnode) {
			page.push(mapnode);
			if (st.state === 'running')
				startPoll();
			return page;
		});
	},

	teardown: function () {
		/* 离开页面时关掉轮询：定时器句柄是模块级的，不关就会一直背着
		 * 已卸载的 DOM 节点，并且每 5 秒打一次 ubus。 */
		stopPoll();
		return true;
	}
});
