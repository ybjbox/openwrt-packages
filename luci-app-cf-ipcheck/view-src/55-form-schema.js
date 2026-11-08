(function (CFI) {
	'use strict';

	/* 字段说明：页面上只留一句短说明，完整解释挂悬停/点击展开。
	 * field() 让短句只写一次；分组归属在第 2 个实参里，同时供 lint 核对。 */
	var HELP = {};

	function help(key, short, full) {
		HELP[key] = full;
		return short;
	}

	function field(map, group, type, key, title, short, long) {
		var o = map.option(type, key, title, short);
		o.description = help(key, short, long);
		return o;
	}

	/* CBI 的 depends 只在真实表单里有；单测的 form 桩没有这个方法。 */
	function dep(o, field, value) {
		if (o && typeof o.depends === 'function')
			o.depends(field, value);
	}

	/* 渲染完成后把完整解释挂到字段旁：悬停保留 title，另加一个「?」按钮
	 * 可点开/收起（触屏可达）。按钮挂在 .cbi-value-description 里，
	 * 不在 .cbi-value-field 内 —— 后者会让 CBI 取值读错（r107 事故）。 */
	function applyHelp(root) {
		if (!root || !root.querySelectorAll)
			return;
		var rows = root.querySelectorAll('.cbi-value');
		for (var i = 0; i < rows.length; i++) {
			var lab = rows[i].querySelector('label[for]');
			var key = '';
			if (lab)
				key = String(lab.htmlFor || '').split('.').pop();
			if (!key && rows[i].getAttribute)
				key = rows[i].getAttribute('data-name') || '';
			if (!key || !HELP[key])
				continue;
			var desc = rows[i].querySelector('.cbi-value-description');
			if (!desc || !desc.appendChild)
				continue;
			if (desc.setAttribute)
				desc.setAttribute('title', HELP[key]);
			if (desc.__cfiHelp)
				continue;
			desc.__cfiHelp = true;
			var id = 'cfi-help-' + key;
			var body = CFI.dom.el('div', { class: 'help-body', id: id, hidden: true, text: HELP[key] });
			var btn = CFI.dom.el('button', {
				class: 'help-q', type: 'button',
				'aria-expanded': 'false', 'aria-controls': id,
				'aria-label': T('展开说明')
			}, '?');
			btn.addEventListener('click', (function (b, box) {
				return function (ev) {
					if (ev && ev.preventDefault)
						ev.preventDefault();
					var open = box.hidden;
					box.hidden = !open;
					b.setAttribute('aria-expanded', open ? 'true' : 'false');
				};
			})(btn, body));
			desc.appendChild(btn);
			desc.appendChild(body);
		}
	}
var GROUPS = [
	{ id: 'basic',  title: '基本设置',   hint: '开关、周期与探测目标' },
	{ id: 'sources', title: '源清单',    hint: '每行一个 HTTPS 地址；改完点页面底部「保存并应用」' },
	{ id: 'probe',  title: '测速与判定', hint: '什么算达标、留几条、按哪个时间看' },
	{ id: 'probeAdv', title: '高级设置', hint: '一般不用改；默认值适配绝大多数线路' },
	{ id: 'dns',    title: 'DNS 解析',   hint: '把优选 IP 写进 Cloudflare 的 A 记录' },
	{ id: 'gist',   title: 'Gist 上传',  hint: '结果外发' }
];

var GROUP_OPTIONS = {
	basic: [ 'enabled', 'interval_hours', 'probe_domains' ],
	sources: [ 'community_sources' ],
	probe: [ 'ttfb_limit', 'total_limit', 'keep_count', 'probe_metric',
	         'dc_pick', 'speed_gate', 'speed_abs_min',
	         'speed_probe', 'speed_count', 'canary_check' ],
	probeAdv: [ 'probe_port', 'log_max_kb',
	            'use_official_ranges', 'reuse_last', 'neighbor_expand',
	            'speed_rel_min', 'speed_weight',
	            'verify_top', 'colo_probe',
	            'dns_ttl', 'dns_token_file', 'token_file' ],
	dns: [ 'dns_sync', 'dns_zone', 'dns_targets', 'dns_token' ],
	gist: [ 'upload_gist', 'gist_id', 'gist_token' ]
};

	/* 33 个字段全在这一张 Map 里（含 community_sources）。
	 * 全页只有一张 CBI Map：两张 Map 会各自刷一次共享的 uci 变更，
	 * 清空一个文本字段时第二次 delete 会 404 并中断整批应用（r136 实测）。 */
	function create() {
		var m = new form.Map('cf_ipcheck', _('实测参数'),
			_('用带真实 SNI 的 HTTPS 探测实测。'));

		var s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		var thr = m.section(form.TypedSection, 'global', _('测速与判定'));
		thr.anonymous = true;

		var adv = m.section(form.TypedSection, 'global', _('高级设置'));
		adv.anonymous = true;

		var o;

o = field(s, 'basic', form.Flag, 'enabled',
	_('启用定时实测'), _('关掉后不再自动跑。'),
	_('关闭时后台只空转，不消耗流量。打开后按上面的定时周期循环：距上一轮「起轮」满一个周期就开始下一轮，所以从关翻到开时若上一轮还在周期内，不会立刻重跑 —— 现在就想测就点「立即测速」。改完点保存就生效，不需要重启服务。'));
		o.rmempty = false;

o = field(s, 'basic', form.Value, 'interval_hours',
	_('定时周期（小时）'), _('两轮之间的间隔。'),
	_('范围 1~168 小时，从上一轮「起轮」的时刻开始算（不是从它结束算），所以一轮跑多久不会把下一轮越推越远。周期越短读数越新鲜，但每轮都要拉一遍社区源并探测候选池，流量与 CPU 开销都会上去 —— 真机一轮约 104.86MB（10 × 10485760 字节），软路由上 6 小时是个折中。手动点「立即测速」同样会把下一轮顺延一个周期。'));
		o.datatype = 'and(uinteger,min(1),max(168))';
		o.default = '6';

o = field(s, 'basic', form.Value, 'probe_domains',
	_('探测域名'), _('逗号分隔，须经 Cloudflare。'),
	_('填你真正要用的那个域名，并且它必须架在 Cloudflare 后面 —— 探测靠 --resolve 把这个域名钉到候选 IP 上，拿到的首字节耗时才是你会实际体验到的值。可以填多个，用英文逗号分隔；引擎会逐个试，并记下每个 IP 胜出的是哪个域名（榜单在多于一种时才会多出「胜出域名」列）。'));
		o.default = 'www.cloudflare.com';

o = field(adv, 'probeAdv', form.Value, 'probe_port',
	_('探测端口'), _('一般保持 443。'),
	_('HTTPS 探测的目标端口。除非你的优选用途不走 443，否则不要改 —— 改成一个非 443 端口后，很多 Cloudflare 边缘节点会直接拒绝握手，榜单会整体变空。这个端口只用于探测，不写进产物：ip.txt 与 Gist 都是一行一个纯 IP（可带 # 注释；端口在 result.json 的 port 字段里）。'));
		o.datatype = 'port';
		o.default = '443';

o = field(adv, 'probeAdv', form.Value, 'log_max_kb',
	_('日志体积上限（KB）'), _('引擎日志的封顶大小。'),
	_('日志写在 /tmp/cf-ipcheck/cf-ipcheck.log，而 /tmp 是 tmpfs —— 不封顶等于慢慢吃内存，能长到多大只取决于多久重启一次。超过这个大小，引擎只保留最近的一半，并在日志里明说「较早的内容被丢弃」，不会悄悄截掉让人以为日志本来就这么短。下限 16 KB 是有意的：再小就装不下一轮的取源与吞吐记录，等于出问题时查不到东西。这一项不决定日志能留多久，重启后本来就会清零。'));
		o.datatype = 'and(uinteger,min(16),max(65536))';
		o.default = '512';

o = field(adv, 'probeAdv', form.Flag, 'use_official_ranges',
	_('Cloudflare 官方网段'), _('抽稀后加进候选池。默认关。'),
	_('打开后会把 Cloudflare 官方公布的网段抽稀后并进候选池。官方网段有几百万个地址，全测不现实，所以只随机取样一部分。默认关是因为社区源通常已经把近期好用的段捞过一遍了；只有当社区源集体失效、或你想自己从头趟一遍时才有必要打开。'));
		o.rmempty = false;

o = field(adv, 'probeAdv', form.Flag, 'reuse_last',
	_('带上上一轮进榜的 IP'), _('让榜单跨轮连续。'),
	_('把上一轮进榜的那几条 IP 并回候选池一起测。好处是榜单不会「一轮好一轮空」地跳；代价是如果一个 IP 已经劣化，它会多占一个候选名额，要再过一两轮才掉出去。'));
		o.default = '1';
		o.rmempty = false;

o = field(adv, 'probeAdv', form.Flag, 'neighbor_expand',
	_('邻居 IP 扩展'), _('对初榜前 5 颗探同段邻居。默认开。'),
	_('打开后，引擎会对初榜前 5 颗 IP 各探测同一 /24 段内 ±4 的邻居。社区清单测的是"别人的线路"，你这条线上最快的 IP 可能就在某颗好 IP 隔壁、却不在任何清单里 —— 这一步就是去隔壁看看。代价是每轮多约 40 次探测（几十秒）。关掉就完全按社区清单测。'));
		o.rmempty = false;
		/* 默认开必须在这里显式声明：Flag 在 uci 里没有该项时画的是「关」，
		 * 与引擎的默认值 1 相反。装机实测（r72）：老部署的 uci 里没有这一项
		 * （升级时 apk 把新配置留在 .apk-new），页面显示关、引擎实际跑开 ——
		 * 用户一动页面点保存，就会把默认开的功能静默写成关。 */
		o.default = '1';

		var srclist = m.section(form.TypedSection, 'global', _('源清单'));
		srclist.anonymous = true;

o = field(srclist, 'sources', form.DynamicList, 'community_sources',
	_('社区优选源 URL'), _('每行一个 HTTPS 文本地址；改完点页面底部「保存并应用」。'),
	_('这些地址返回纯文本，里面夹着一堆 IPv4；引擎逐行提取、去重后进候选池，没有格式要求。'
			+ '改完必须点页面底部的「保存并应用」才会写进配置文件 —— LuCI 的「保存」只把改动留在 rpcd 进程内存里，引擎读不到。'));




		/* r90：判定口径。两种算法的量纲不同，所以它不是"精度开关"，而是"换了一套尺子"——
		 * 长说明必须把「不能互相比较」写在最前面，否则改完之后新旧两轮的数字会被当成
		 * 变化趋势看。 */
o = field(thr, 'probe', form.ListValue, 'probe_metric',
	_('按哪个时间判定'), _('默认按 HTTP 首字节时间。'),
	_('两种方式量的不是同一件事，结果不能互相比较 —— 换过之后整张榜会重排，别拿新旧两轮的数字比快慢。按 HTTP 首字节（默认）：量到服务器把第一个字节送回来，含建连、加密握手和服务器反应，最接近打开网页的感受。按 TCP 建连：只量到连接建立，数值低 30%~50%，看着好看但说明不了服务器有多快，适合只想筛掉连不上的 IP。选 TCP 时，榜单与机房汇总那一列会改标成 TCP。'));
		o.default = 'http';
		o.value('http', _('按 HTTP 首字节时间'));
		o.value('tcp', _('按 TCP 建连时间'));

o = field(thr, 'probe', form.Value, 'ttfb_limit',
	_('首字节上限（毫秒）'), _('首字节超了就淘汰。'),
	_('第一道门槛：首字节时间超过这个值就判为不达标。首字节耗时反映的是「服务器反应过来」的速度，最接近网页首屏的感受，所以拿它当主门槛。默认 3000ms 是个宽松值，想只留精品可以压到 800~1000。'));
		o.datatype = 'and(uinteger,min(100),max(600000))';
		o.default = '3000';

o = field(thr, 'probe', form.Value, 'total_limit',
	_('总耗时上限（毫秒）'), _('第二道门槛。'),
	_('必须与首字节时间同时满足才算可用。它管的是整个请求从头到尾的时间，能挡掉那些「响应快但传得慢」的节点。两道门槛是「与」的关系，任一超限就淘汰。'));
		o.datatype = 'and(uinteger,min(200),max(600000))';
		o.default = '5000';

o = field(thr, 'probe', form.Value, 'keep_count',
	_('榜单保留条数'), _('按首字节时间升序取前 N。'),
	_('排序规则是首字节时间升序，同值再看总耗时。为什么不看总耗时：它含响应体下载时间，一次偶发 403 的错误页几乎没有正文，按总耗时排会白赚约 500 毫秒抢到榜首。保留条数不影响测速本身，只影响写出多少条以及页面上列多少行；留 10 条左右足够客户端做故障切换。'));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';

o = field(adv, 'probeAdv', form.Value, 'verify_top',
	_('多样本验证个数'), _('初榜前 N 个各测 3 次取中位数。'),
	_('对初榜前 N 个 IP 各再串行探测 2 次（连同首次共 3 个样本），用中位数参与最终排名，顺带得到丢包率与抖动。家宽上单次采样的抖动有 ±50~100 毫秒，比榜单相邻名次的差距还大 —— 不验证的话"谁排第一"基本是运气，每次轮次的第一名都可能换人。填 0 关闭（回到单次采样）。'));
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '30';

		/* r90：按机房收窄榜单。填 all / auto 或三位机房码 —— 用文本框而不是下拉，
		 * 是因为机房码有几百个、而且会新增，写死一张表就成了"每加一个机房改一次页面"。 */
o = field(thr, 'probe', form.Value, 'dc_pick',
	_('只留某个机房'), _('默认 all：全部机房都留在榜上。'),
	_('all（默认）：不过滤，各机房一起排，汇总照常列出每一个。auto：只留中位最快的那一个机房 —— 看中位不看单颗，单颗快可能只是碰巧。也可以直接填三位机房码（NRT 东京、SIN 新加坡、LAX 洛杉矶），只留这个机房。跨机房差距大时（东京 40ms、新加坡 120ms）混排会让客户端切到慢的明显卡，所以才有人这么做。填了机房码但这一轮没有该机房的 IP，榜单会是空的 —— 先看上方汇总表里有哪些机房。'));
		o.default = 'all';
		o.placeholder = 'all';


o = field(thr, 'probe', form.Flag, 'speed_probe',
	_('进榜后再测下载速度'), _('串行拉大文件测 MB/s。'),
	_('对进榜的那几条 IP 逐个（串行，不并发）拉一个较大的文件，算出吞吐。这一步很费流量，所以默认只测前若干个 IP。测出来的 MB/s 只作参考，不参与排序。'));
		o.default = '1';
		o.rmempty = false;

o = field(thr, 'probe', form.Value, 'speed_count',
	_('测吞吐的 IP 个数'), _('N × 单次字节数 = 每轮流量。'),
	_('只对榜单前 N 个测吞吐。流量 = N × 单次下载字节数，按默认值算就是 10 × 10485760 字节 ≈ 104.86MB/轮。填 0 等于关掉吞吐测试（但仍保留那一列，显示为 —）。'));
		dep(o, 'speed_probe', '1');
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '10';

		/* r88：吞吐判定。三步顺序（连通性 → 稳定性 → 下载速度）只在 speed_gate
		 * 的长说明里讲一次，其余字段各说各的那一格，避免同一段话抄六遍。 */
o = field(thr, 'probe', form.Flag, 'speed_gate',
	_('用下载测速判定 IP 好坏'), _('默认开；关掉就只按连通性排序。'),
	_('打开后，每颗 IP 按三步判定：第一步看连通性 —— 能不能连上、加密握手（TLS）成不成功、第一个字节多久到；第二步看稳定性 —— 同一颗 IP 多测几次，丢包超过三分之一就不要；第三步才看下载速度 —— 低于绝对下限直接淘汰，低于本批中位数乘相对下限也淘汰；如果测速是因为超时被截断、但已经下了不少，按「真实只会更快」从宽处理，留到精测阶段再定。关掉这个开关，就回到只看连通性排序（旧行为）。'));
		o.rmempty = false;
		o.default = '1';

o = field(thr, 'probe', form.Value, 'speed_abs_min',
	_('绝对下限（MB/s）'), _('低于这个速度直接淘汰。'),
	_('单位是十进制 MB/s：1 MB = 1000000 字节。0.5 MB/s 大概能流畅看 480p，1.5 左右够 1080p。低于这个值就没有必要再跟别的 IP 比了。'));
		dep(o, 'speed_gate', '1');
		o.datatype = 'and(ufloat,min(0))';
		o.default = '0.50';

o = field(adv, 'probeAdv', form.Value, 'speed_rel_min',
	_('相对下限（%）'), _('低于本批中位数的这个比例就淘汰。'),
	_('跟本批中位数比，而不是跟一个固定值比，是为了适应不同线路：百兆宽带和千兆宽带该留的 IP 本来就不一样。本批有效样本少于 5 个时，只按绝对下限判，免得少数几个样本把中位数带偏。'));
		dep(o, 'speed_gate', '1');
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '25';







o = field(adv, 'probeAdv', form.Value, 'speed_weight',
	_('速度在排名里的权重'), _('0 只看延迟，100 只看速度，默认 40。'),
	_('0 表示完全按延迟排，100 表示完全按下载速度排，40 是默认的折中。举例：延迟差不多时，10 MB/s 的 IP 会排在 0.2 MB/s 的前面。'));
		dep(o, 'speed_gate', '1');
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '40';







o = field(adv, 'probeAdv', form.Flag, 'colo_probe',
	_('识别落地机房'), _('取 cdn-cgi/trace 的 colo。'),
	_('对进榜的那几条 IP 请求一次 /cdn-cgi/trace，取里面的 colo= 字段，就知道这个 IP 实际把你带到哪个 Cloudflare 机房。多花一次请求，但能一眼看出你的流量是不是绕道了。'));
		o.default = '1';
		o.rmempty = false;


o = field(thr, 'probe', form.Flag, 'canary_check',
	_('每轮先自检出口是否被接管'), _('拿保留地址探一次。'),
	_('每轮开始前，用 RFC 保留（不可路由）地址走一遍与真实探测完全相同的路径。正常情况下请求根本发不出去；拿到响应就说明本机出口被透明代理接管了 —— 这一轮的耗时其实是「本机 → 代理 → CF」，不能用来判断 IP 好坏。检测到接管时本页出红条，并跳过机房与吞吐两列。想不再报：在代理里把探测域名和 Cloudflare 网段设为直连/绕过（本插件不改代理），或临时停掉代理再跑一轮。'));
		o.default = '1';
		o.rmempty = false;



		var dns = m.section(form.TypedSection, 'global', _('DNS 解析'));
		dns.anonymous = true;

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

o = field(gs, 'gist', form.Flag, 'upload_gist',
	_('每轮结束后上传 ip.txt'), _('失败只记日志。'),
	_('每轮跑完把结果推到 GitHub Gist，方便在多台设备之间共享同一份优选清单。上传失败不会影响本地结果，只在日志里记一笔；下一轮会重试。上传成功后，日志里会跟着写一行「稳定链接」—— 那种不随更新变化的地址，可以直接复制去别的工具订阅（GitHub 接口本身给的链接每版都带一个变化的版本号，不适合长期订阅）。'));
		o.rmempty = false;

o = field(gs, 'gist', form.Value, 'gist_id',
	_('Gist ID'), _('先手工建一个 Gist。'),
	_('Gist 就是 GitHub 上的一段可共享文本，可以设成私有；引擎把结果写进你指定的那一个，别的设备再从它拉同一份清单。网址最后那串字符就是 ID，例如 gist.github.com/you/1a2b3c… 里的 1a2b3c…。需要先在 GitHub 上手工建一个（空的私有 Gist 就行），引擎不会替你创建。'));
		dep(o, 'upload_gist', '1');


o = field(gs, 'gist', form.Value, 'gist_token',
	_('GitHub Token'), _('只需 gist 权限。'),
	_('令牌是 GitHub 账号的访问凭证，在「设置 → 开发者设置 → Fine-grained tokens / Personal access tokens」里生成，只勾 gist 一个权限就够，不要用全权限令牌。填在这里它会以掩码回显，并随 sysupgrade 备份一起走 —— 不想让它进配置文件的话，改用下面的 Token 文件路径。'));
		dep(o, 'upload_gist', '1');
		o.password = true;

o = field(adv, 'probeAdv', form.Value, 'token_file',
	_('Token 文件路径（备选）'), _('两处都填时以 gist_token 为准。'),
	_('不想把令牌写进 UCI 配置（因为它会随备份走并回显）时，把令牌单独写在一个文件里，这里填路径。文件权限建议 600。两个位置都填了的话，以 gist_token 为准。'));
		dep(o, { upload_gist: '1', gist_token: '' });
		o.default = '/etc/cf-ipcheck.token';

		/* ---- DNS 解析（r96，可选）----
		 * 这一组只做一件事：把每轮榜首写进 Cloudflare 的一条 A 记录。
		 * 它与「下发」不是一类东西 —— 不碰路由器上任何配置文件，只发两三次 API 请求，
		 * 出事最多是解析不对、删记录就还原。
		 * dns_proxied 故意不暴露：橙云会让 CF 返回它自己的 anycast 地址，客户端根本
		 * 解析不到我们优选的那颗 IP，开关摆在这里只会让人误以为可以切。 */
o = field(dns, 'dns', form.Flag, 'dns_sync',
	_('同步到 Cloudflare DNS'), _('每轮跑完把优选 IP 写进这些 A 记录。'),
	_('打开后，每轮正常跑完（出口没被代理接管、也没被你叫停）就把榜单前几名写进下面清单里的每个记录名。只发真正有差异的写请求 —— 记录内容已经一致就直接跳过，免得每 6 小时白刷一次记录 TTL。这条路径不修改路由器上任何配置文件。想立刻同步一次：先点页面底部的「保存并应用」（没保存时引擎读不到这些配置），再切到「榜单」页点「立即写一次 DNS」—— 那颗按钮不管这个开关开没开都会执行。'));
		o.rmempty = false;

o = field(dns, 'dns', form.Value, 'dns_zone',
	_('Zone（域名或 ID）'), _('例如 example.com。'),
	_('要改的那条记录所在的 zone。填域名（example.com）会先去 API 查一次 zone id；填 32 位 zone id 就跳过那一步。注意 zone 是 example.com，不是记录名 cf.example.com。'));
		dep(o, 'dns_sync', '1');

		/* 多行文本框。这里有个必须处理的坑：uci 的 option 值不能含换行
		 * （换行会把 /etc/config 写成两行，直接坏掉），所以配置里存成
		 * 「分号分隔的单行」，界面上读写时各转一次。不转的话用户一按保存就写出坏配置。 */
o = field(dns, 'dns', form.TextValue, 'dns_targets',
	_('记录名清单'), _('一行一个机房；同一记录名多行会合并'),
	_('每行一条：记录名 数量 [@机房码] [zone]，后三项可省。数量 = 这个记录名下挂几条 A 记录（省=1，最多 10）；同名多条在 DNS 层轮流返回，某颗连不上会自动落到别的，所以这既是分散也是粗粒度容灾。写 @NRT 就只取这个机房的 IP（机房码见「榜单」页的汇总）；同一个记录名可以写多行、每行一个机房 —— 会合并成一处再写：条数取最大的那个，机房取并集，候选 IP 跨机房按延迟合并排序（日本同时有 NRT 和 KIX 时不会互相覆盖）。某个机房这一轮没有可用 IP 时，这个记录名会被清空（日志会明说）；怕断就把同一域名再挂一行不带 @ 的做全局兜底。zone 省了用上面的 Zone，两处都空就从记录名推（cf.example.com → example.com）；多个记录名分属不同域名时各自行尾写 zone。行首 # 为注释。例：jp.example.com 2 @NRT；只改带 cf-ipcheck 备注的记录，面板上手工加的不会被碰；可用 IP 不够时按实际写，并在日志里说明。'));
		dep(o, 'dns_sync', '1');
		o.rows = 5;

		o.cfgvalue = function (section_id) {
			/* 这台机器的 CBI 上 this.super 拿不到值 —— 真机实测：配置里明明有
			 * option dns_targets 'test.bjstudio.eu.org 3 @NRT'，文本框却是空的，
			 * 于是页面显示"没保存过"。所以 super 给空就直接问 uci 兜底。 */
			var v = '';
			try {
				v = (this.super ? this.super('cfgvalue', [ section_id ]) : '') || '';
			} catch (e) {
				v = '';
			}
			if (v === '' && typeof uci !== 'undefined' && uci.get) {
				try {
					v = uci.get('cf_ipcheck', section_id, 'dns_targets') || '';
				} catch (e2) {
					v = '';
				}
			}
			return String(v).replace(/;[ \t]*/g, '\n');
		};
		o.write = function (section_id, formvalue) {
			var lines = String(formvalue || '').split(/\r?\n/).map(function (s) {
				return s.replace(/^[ \t]+|[ \t]+$/g, '');
			}).filter(function (s) { return s.length > 0; });
			if (this.super)
				return this.super('write', [ section_id, lines.join('; ') ]);
			return lines.join('; ');
		};
		o.validate = function (section_id, value) {
			var bad = String(value || '').split(/\r?\n/).filter(function (s) {
				s = s.replace(/^[ \t]+|[ \t]+$/g, '');
				return s.length > 0 && s.charAt(0) !== '#' && !/^[A-Za-z0-9*][A-Za-z0-9.*_-]*\.[A-Za-z0-9.-]+/.test(s);
			});
			return bad.length ? _('这几行不像记录名：') + ' ' + bad.join(' / ') : true;
		};


o = field(adv, 'probeAdv', form.Value, 'dns_ttl',
	_('TTL（秒）'), _('建议 60，便于切换。'),
	_('记录的缓存时间。60 秒意味着切换后一分钟内客户端就能拿到新 IP；填 1 表示「自动」，用 Cloudflare 自己的默认值（通常 300 秒），切换会慢一些。下限 1、上限 86400（一天）。'));
		dep(o, 'dns_sync', '1');
		o.datatype = 'and(uinteger,min(1),max(86400))';
		o.default = '60';

o = field(dns, 'dns', form.Value, 'dns_token',
	_('API 令牌'), _('需要 Zone → DNS → Edit 权限。'),
	_('在 Cloudflare「我的个人资料 → API 令牌」里建一个自定义令牌，权限只需 Zone → DNS → Edit，范围限定到具体 zone。它和上面的 Gist 令牌不是同一个（那个只有 gist 权限，调不了 DNS 接口），不要复用。填在这里会以掩码回显，并随 sysupgrade 备份走；不想让它进配置文件就用下面的令牌文件路径。'));
		dep(o, 'dns_sync', '1');
		o.password = true;

o = field(adv, 'probeAdv', form.Value, 'dns_token_file',
	_('令牌文件路径（备选）'), _('两处都填时以令牌为准。'),
	_('把令牌单独写在一个文件里，这里填路径（建议权限 600），配置里就不留明文。两处都填时以 dns_token 为准。文件读不到时按「没填令牌」处理并只记一行日志 —— 不会拿空令牌去请求。'));
		dep(o, { dns_sync: '1', dns_token: '' });

		return m;
	}

	CFI.form = {
		HELP: HELP,
		help: help,
		field: field,
		applyHelp: applyHelp,
		GROUPS: GROUPS,
		OPTIONS: GROUP_OPTIONS,
		create: create
	};
})(CFI);
