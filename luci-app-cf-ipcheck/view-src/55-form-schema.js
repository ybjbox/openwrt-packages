(function (CFI) {
	'use strict';

	/* 字段说明：短句默认收起、只留一个「?」；点开后短句与完整解释一起出现。
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

	/* 渲染完成后挂说明入口：「?」紧跟字段标题，说明整行默认不占位；点开时短句与
	 * 完整解释一起出现（触屏可达）。按钮挂在 .cbi-value-title（label）里，
	 * 不碰 .cbi-value-field —— 后者会让 CBI 取值读错（r107 事故）。
	 * 注意 label 内的 button **会**触发 label 对关联控件的激活（r182 真机实测：
	 * 点「启用定时实测」的 ? 直接把开关从开切成关），不能指望规范豁免，
	 * 必须按下面那样在 label 的捕获阶段把事件拦下来。短句是 CBI 生成的裸文本节点，
	 * 这里不搬动、不复制：只给容器加 data-cfi-help，由 CSS 把整行缩成不占位；展开时切
	 * data-cfi-open=1 恢复字号与行高。短句仍只有 field() 那一处出处，
	 * lint 的短句守卫与 33 字段表都不受影响。 */
	/* 展开/收起说明：按钮自身点击与 label 捕获拦截两处共用（ES5 写法，定义在循环外）。 */
	function toggleHelp(b, box, d) {
		var open = box.hidden;
		box.hidden = !open;
		if (d.setAttribute)
			d.setAttribute('data-cfi-open', open ? '1' : '0');
		b.setAttribute('aria-expanded', open ? 'true' : 'false');
	}
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
			if (desc.__cfiHelp)
				continue;
			desc.__cfiHelp = true;
			if (desc.setAttribute) {
				desc.setAttribute('data-cfi-help', '1');
				desc.setAttribute('data-cfi-open', '0');
			}
			var id = 'cfi-help-' + key;
			var body = CFI.dom.el('div', { class: 'help-body', id: id, hidden: true, text: HELP[key] });
			var btn = CFI.dom.el('button', {
				class: 'help-q', type: 'button',
				'aria-expanded': 'false', 'aria-controls': id,
				'aria-label': T('展开说明'), title: T('展开说明')
			}, '?');
			/* 「?」挂在 label[for] 里，而 label 会把点击转发给关联控件 —— 真机实测：
			   点「启用定时实测」的 ? 会把这个开关从开切成关（checked true→false，行上还
			   出现「已改动」标记），用户想看说明却改了配置。
			   试过并在真机上否掉的三种拦法：按钮自身的 click preventDefault（无效）、
			   mousedown preventDefault（无效，激活发生在更早）、label 捕获阶段只
			   preventDefault（无效）。只有「label 捕获阶段 stopPropagation + 手动展开」
			   能同时做到不改控件、又把说明打开 —— 代价是按钮收不到这次 click，
			   所以展开逻辑抽成 toggleHelp 给两处共用。 */
			btn.addEventListener('click', function (ev) {
				if (ev && ev.preventDefault)
					ev.preventDefault();
				toggleHelp(btn, body, desc);
			});
			if (lab && lab.addEventListener) {
				lab.addEventListener('click', function (ev) {
					if (!ev || ev.target !== btn)
						return;
					if (ev.preventDefault)
						ev.preventDefault();
					if (ev.stopPropagation)
						ev.stopPropagation();
					toggleHelp(btn, body, desc);
				}, true);
			}
			/* 有标题就挂在标题旁；没有标题（异常结构）仍退回说明行，不至于丢入口。 */
			if (lab && lab.appendChild)
				lab.appendChild(btn);
			else
				desc.appendChild(btn);
			desc.appendChild(body);
		}
	}
var GROUPS = [
	{ id: 'basic',  title: '基本设置',   hint: '开关、周期与探测目标' },
	{ id: 'sources', title: '源清单',    hint: '每行填一个网址，内容是一份 IP 地址清单；改完点「保存并应用」' },
	{ id: 'probe',  title: '测速与判定', hint: '什么算可用、留几条、按哪个时间看' },
	{ id: 'probeAdv', title: '高级设置', hint: '一般不用改；默认值适配绝大多数线路' },
	{ id: 'dns',    title: 'DNS 解析',   hint: '把选出的地址写进 Cloudflare 的域名解析记录' },
	{ id: 'gist',   title: 'Gist 上传',  hint: '把结果上传到 GitHub Gist，方便别的设备共用' }
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
			_('用真实网站域名，通过 HTTPS 连接逐个实测。'));

		var s = m.section(form.TypedSection, 'global', _('基本设置'));
		s.anonymous = true;

		var thr = m.section(form.TypedSection, 'global', _('测速与判定'));
		thr.anonymous = true;

		var adv = m.section(form.TypedSection, 'global', _('高级设置'));
		adv.anonymous = true;

		var o;

o = field(s, 'basic', form.Flag, 'enabled',
	_('启用定时实测'), _('关掉后不再自动测。'),
	_('关闭后不再自动开始新一轮，也不会产生测速流量。打开后按上面的周期循环，从上一轮开始的时刻算起，不是从它结束算起 —— 所以刚打开时若距上一轮还不满一个周期，不会立刻重跑；想马上测就点「立即测速」。改完保存即生效，不用重启服务。'));
		o.rmempty = false;

o = field(s, 'basic', form.Value, 'interval_hours',
	_('定时周期（小时）'), _('两轮之间的间隔，单位小时。'),
	_('可填 1~168 小时，从上一轮开始的时刻算，一轮跑多久都不会把下一轮越推越远。周期越短结果越新，但每轮都要重新下载地址清单并逐个测试，流量和 CPU 占用都会上升；软路由上 6 小时是个折中。手动点「立即测速」也会把下一轮顺延一个周期。'));
		o.datatype = 'and(uinteger,min(1),max(168))';
		o.default = '6';

o = field(s, 'basic', form.Value, 'probe_domains',
	_('探测域名'), _('填你实际要用的域名，且必须已接入 Cloudflare；多个用英文逗号隔开。'),
	_('测试时会把填写的域名固定指向被测试的地址，这样量到的等待时间才接近你实际打开网页的感受。可以填多个，测速程序会逐个试，并记录每个地址在哪个域名下表现最好；结果里用了不止一种域名时，才会多出「胜出域名」那一列。域名没接入 Cloudflare 时，测出来的数值不能代表真实使用效果。'));
		o.default = 'www.cloudflare.com';

o = field(adv, 'probeAdv', form.Value, 'probe_port',
	_('探测端口'), _('一般保持 443。'),
	_('HTTPS 测试用的端口。除非你的用途不走 443，否则不要改 —— 改成别的端口后，大多数 Cloudflare 节点会直接拒绝连接，结果可能为空。这个端口只用于测试，不会写进结果文件：导出和上传的都是一行一个纯 IP 地址，不会带端口。'));
		o.datatype = 'port';
		o.default = '443';

o = field(adv, 'probeAdv', form.Value, 'log_max_kb',
	_('日志体积上限（KB）'), _('日志文件最多占多少 KB（千字节）。'),
	_('日志存在内存里，不封顶会慢慢吃掉内存。超过这个大小，只保留最近的一半，并在日志里明说「较早的内容被丢弃」，不会悄悄截掉。下限 16 KB：再小就装不下一轮的记录，出问题时查不到东西。这一项不决定日志能留多久，重启后本来就会清零。'));
		o.datatype = 'and(uinteger,min(16),max(65536))';
		o.default = '512';

o = field(adv, 'probeAdv', form.Flag, 'use_official_ranges',
	_('Cloudflare 官方网段'), _('从 Cloudflare 官方公布的地址段里随机抽一些一起测。默认关。'),
	_('打开后，会把官方公布的地址段随机取样一部分，并进待测清单。官方地址段有几百万个，全测不现实，只能抽一部分。默认关是因为社区清单通常已经收录了近期好用的地址；只有当社区清单集体失效，或你想自己从头试一遍时才有必要打开。'));
		o.rmempty = false;

o = field(adv, 'probeAdv', form.Flag, 'reuse_last',
	_('带上上一轮进榜的 IP'), _('把上一次的结果也再测一遍，让结果更稳定。'),
	_('把上一轮选中的地址并回待测清单一起测。好处是结果不会「一轮好一轮空」地跳；代价是某个地址已经变差时，它会多占一个名额，要再过一两轮才会被换掉。'));
		o.default = '1';
		o.rmempty = false;

o = field(adv, 'probeAdv', form.Flag, 'neighbor_expand',
	_('邻居 IP 扩展'), _('顺便试试表现最好的 5 个地址附近的相邻地址。默认开。'),
	_('打开后，对暂时排在最前的 5 个地址，各测试同一网段内前后各 4 个相邻地址。社区清单测的是别人的线路，你这条线上最快的地址可能就在某个好地址隔壁、却不在任何清单里，这一步就是去找它。代价是每轮多约 40 次测试（几十秒）。关掉就完全按社区清单测。'));
		o.rmempty = false;
		/* 默认开必须在这里显式声明：Flag 在 uci 里没有该项时画的是「关」，
		 * 与引擎的默认值 1 相反。装机实测（r72）：老部署的 uci 里没有这一项
		 * （升级时 apk 把新配置留在 .apk-new），页面显示关、引擎实际跑开 ——
		 * 用户一动页面点保存，就会把默认开的功能静默写成关。 */
		o.default = '1';

		var srclist = m.section(form.TypedSection, 'global', _('源清单'));
		srclist.anonymous = true;

o = field(srclist, 'sources', form.DynamicList, 'community_sources',
	_('社区优选源 URL'), _('每行填一个网址，内容是一份纯文本的 IP 地址清单；改完点页面底部「保存并应用」。'),
	_('这些网址返回纯文本，里面夹着 IPv4 地址；测速程序逐行提取、去重后作为待测地址，对格式没有要求。改完必须点页面底部的「保存并应用」才会写进配置文件 —— 只点「保存」，改动还留在页面后台，程序读不到。'));




		/* r90：判定口径。两种算法的量纲不同，所以它不是"精度开关"，而是"换了一套尺子"——
		 * 长说明必须把「不能互相比较」写在最前面，否则改完之后新旧两轮的数字会被当成
		 * 变化趋势看。 */
o = field(thr, 'probe', form.ListValue, 'probe_metric',
	_('按哪个时间判定'), _('默认按网页开始响应的快慢判定。'),
	_('两种方式量的不是同一件事，结果不能互相比较；换过之后整张结果列表会重排，别拿新旧两轮的数字比快慢。按网页开始响应（默认）：量到服务器送回第一个字节，含建立连接、加密握手和服务器反应，最接近打开网页的感受。按建立连接：只量到连接打通，数值通常低 30%~50%，看着好看但说明不了服务器快不快，适合只想筛掉连不上的地址。选后者时，结果和各地汇总那一列会改标成 TCP。'));
		o.default = 'http';
		o.value('http', _('按网页开始响应（HTTP）'));
		o.value('tcp', _('按建立连接（TCP）'));

o = field(thr, 'probe', form.Value, 'ttfb_limit',
	_('首字节上限（毫秒）'), _('网页开始响应超过这个毫秒数就不要。'),
	_('第一道门槛：网页开始响应的时间超过这个值就判为不符合要求。这个时间反映服务器「反应过来」的速度，最接近打开网页首屏的感受，所以拿它当主门槛。默认 3000 毫秒比较宽松，想只留更快的地址可以调到 800~1000 毫秒。'));
		o.datatype = 'and(uinteger,min(100),max(600000))';
		o.default = '3000';

o = field(thr, 'probe', form.Value, 'total_limit',
	_('总耗时上限（毫秒）'), _('整个请求超过这个毫秒数也不要（两个上限要同时满足）。'),
	_('必须和上一项同时满足才算可用。它管的是整个请求从头到尾的时间，能挡掉那些「回应很快但传得慢」的地址。两项是「并且」的关系，任一超限就排除。'));
		o.datatype = 'and(uinteger,min(200),max(600000))';
		o.default = '5000';

o = field(thr, 'probe', form.Value, 'keep_count',
	_('榜单保留条数'), _('最终只保留排名靠前的前 N 条。'),
	_('排名会同时考虑网页响应速度和下载速度（见「速度在排名里的权重」），分数相同时再依次比网页响应时间、整个请求时间；这一项只决定写出多少条、页面列多少行，不影响测速本身。留 10 条左右足够客户端在其中切换。'));
		o.datatype = 'and(uinteger,min(1),max(100))';
		o.default = '10';

o = field(adv, 'probeAdv', form.Value, 'verify_top',
	_('多样本验证个数'), _('排名靠前的 N 个各多测 2 次，取中间值。填 0 关闭。'),
	_('对暂时排在前 N 个的地址各再测 2 次（连同首次共 3 次），用中间那次的结果参与最终排名，顺带算出测不通的比例和忽快忽慢的差距。家宽单次测试的波动有 50~100 毫秒，比相邻名次的差距还大 —— 不多测几次，谁排第一基本靠运气。填 0 就回到只测一次。'));
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '30';

		/* r90：按机房收窄榜单。填 all / auto 或三位机房码 —— 用文本框而不是下拉，
		 * 是因为机房码有几百个、而且会新增，写死一张表就成了"每加一个机房改一次页面"。 */
o = field(thr, 'probe', form.Value, 'dc_pick',
	_('只留某个机房'), _('填 all 不限制，auto 只留整体最快的一个所在地。'),
	_('all（默认）：不过滤，各地地址一起排。auto：只留整体上最快的那一个地方 —— 看的是这个地方的典型水平，不是某一颗特别快，单颗快可能只是碰巧。也可以直接填三位所在地代码（NRT 东京、SIN 新加坡、LAX 洛杉矶）只留这一个。各地速度差距大时混在一起，客户端可能切到慢的那个，所以才有人这样设。如果填的代码这一轮没有对应地址，会自动改回不限制，不会给出空结果 —— 可以先看上方汇总里有哪些地方。'));
		o.default = 'all';
		o.placeholder = 'all';


o = field(thr, 'probe', form.Flag, 'speed_probe',
	_('进榜后再测下载速度'), _('对结果里的地址逐个下载测试文件，算出下载速度。'),
	_('对选出来的地址一个一个下载较大的文件（不并发），算出下载速度。这一步很费流量，所以默认只对一部分地址做。测出来的速度会按「速度在排名里的权重」参与排名，不只是参考值。'));
		o.default = '1';
		o.rmempty = false;

o = field(thr, 'probe', form.Value, 'speed_count',
	_('测吞吐的 IP 个数'), _('设为 0 可关掉下载测速。'),
	_('实际会先粗测约 20 个地址、再对其中较快的 3 个做精测，每轮要下载上百 MB 测试数据，流量较大。填 0 等于关掉下载测速（结果里仍保留下载速度那一列，显示为 —）。若曾在配置文件里单独设置过粗测数量，则以那个设置为准，此时填 0 不会关闭测速。'));
		dep(o, 'speed_probe', '1');
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '10';

		/* r88：吞吐判定。三步顺序（连通性 → 稳定性 → 下载速度）只在 speed_gate
		 * 的长说明里讲一次，其余字段各说各的那一格，避免同一段话抄六遍。 */
o = field(thr, 'probe', form.Flag, 'speed_gate',
	_('用下载测速判定 IP 好坏'), _('默认开；关掉就只按能不能连上和响应速度排序。'),
	_('打开后按三步筛：① 能不能连上、加密连接（TLS）是否成功、网页开始响应够不够快；② 同一地址多测几次，测不通的次数超过三分之一就不要；③ 再看下载速度，低于「绝对下限」直接排除，明显慢于本轮大多数地址的也排除。下载因超时中断但已经下了不少时，按「只会更快」从宽保留。关掉这个开关，就回到只看连通性和响应速度。'));
		o.rmempty = false;
		o.default = '1';

o = field(thr, 'probe', form.Value, 'speed_abs_min',
	_('绝对下限（MB/s）'), _('下载速度低于这个值就直接排除。'),
	_('单位是 MB/秒，按 1 MB = 100 万字节计算。0.5 MB/秒大概能流畅看 480p，1.5 左右够 1080p。低于这个值就没必要再跟别的地址比了。'));
		dep(o, 'speed_gate', '1');
		o.datatype = 'and(ufloat,min(0))';
		o.default = '0.50';

o = field(adv, 'probeAdv', form.Value, 'speed_rel_min',
	_('相对下限（%）'), _('低于这一轮所有地址速度中间值的这个百分比就排除。'),
	_('跟本轮的中间值比，而不是跟固定值比，是为了适应不同宽带：百兆和千兆该留的地址本来就不一样。中间值就是把速度从快到慢排、取正中间那个。本轮有效样本少于 5 个时只看「绝对下限」，免得少数几个地址把中间值带偏。'));
		dep(o, 'speed_gate', '1');
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '25';







o = field(adv, 'probeAdv', form.Value, 'speed_weight',
	_('速度在排名里的权重'), _('0 只看响应速度，100 只看下载速度，默认 40。'),
	_('0 表示完全按响应速度排，100 表示完全按下载速度排，40 是默认的折中。举例：响应速度差不多时，10 MB/秒的地址会排在 0.2 MB/秒的前面。'));
		dep(o, 'speed_gate', '1');
		o.datatype = 'and(uinteger,min(0),max(100))';
		o.default = '40';







o = field(adv, 'probeAdv', form.Flag, 'colo_probe',
	_('识别落地机房'), _('查一下每个地址实际连到 Cloudflare 的哪个城市。'),
	_('对结果里的地址额外请求一次 Cloudflare 的调试接口，读出它实际把你带到哪个城市。多花一次请求，但能一眼看出流量是不是绕了远路。'));
		o.default = '1';
		o.rmempty = false;


o = field(thr, 'probe', form.Flag, 'canary_check',
	_('每轮先自检出口是否被接管'), _('先用一个不可能连通的地址试一次，检查上网流量是不是走了代理。'),
	_('每轮开始前，用一个保留地址（正常网络里根本连不通）走一遍和真实测速完全相同的路径。正常应该发不出去；如果收到回应，说明本机流量被透明代理或加速器接管了，这一轮量到的是「本机 → 代理 → Cloudflare」，不能用来判断地址好坏。这时页面会出红条，本轮不再测下载速度（下载速度那一列显示 —），结果仅供参考。想不再报：在代理里把探测域名和 Cloudflare 地址段设为直连或绕过（本插件不改代理），或临时关掉代理再跑一轮。'));
		o.default = '1';
		o.rmempty = false;



		var dns = m.section(form.TypedSection, 'global', _('DNS 解析'));
		dns.anonymous = true;

		var gs = m.section(form.TypedSection, 'global', _('Gist 上传'));
		gs.anonymous = true;

o = field(gs, 'gist', form.Flag, 'upload_gist',
	_('每轮结束后上传 ip.txt'), _('上传失败只记一行日志，不影响本地结果，下一轮会重试。'),
	_('每轮跑完把结果传到 GitHub Gist，方便多台设备共用同一份清单。上传失败不影响本地结果，下一轮会重试。成功后日志里会多一行「稳定链接」—— 这个地址不随更新变化，可以直接复制去别的工具长期订阅（GitHub 接口给的链接每次更新都会变，不适合订阅）。'));
		o.rmempty = false;

o = field(gs, 'gist', form.Value, 'gist_id',
	_('Gist ID'), _('需要先在 GitHub 上手工新建一个 Gist（可设为私密）。'),
	_('Gist 就是 GitHub 上一段可共享的文本，可以设成私密；测速程序把结果写进你指定的那一个，别的设备再从它取同一份清单。网址最后那串字符就是 ID，例如 gist.github.com/you/1a2b3c… 里的 1a2b3c…。需要先在 GitHub 上手工建一个（空的私密 Gist 就行），程序不会替你创建。'));
		dep(o, 'upload_gist', '1');


o = field(gs, 'gist', form.Value, 'gist_token',
	_('GitHub Token'), _('生成时只勾选 Gist 读写权限即可，不要用全权限令牌。'),
	_('令牌是 GitHub 账号的访问凭证，在「设置 → 开发者设置 → 个人访问令牌」里生成，只勾 Gist 一个权限就够。填在这里会以掩码显示，并在升级固件时随配置备份一起保存 —— 不想让它进配置文件，改用下面的「Token 文件路径」。'));
		dep(o, 'upload_gist', '1');
		o.password = true;

o = field(adv, 'probeAdv', form.Value, 'token_file',
	_('Token 文件路径（备选）'), _('两处都填时，以上面直接填写的令牌为准。'),
	_('不想把令牌写进配置文件（它会随备份一起保存、也会在页面上掩码显示）时，可以把令牌单独写进一个文件，这里填文件路径。文件建议只让所有者可读写（权限 600）。两个位置都填了，以直接填写的令牌为准。'));
		dep(o, { upload_gist: '1', gist_token: '' });
		o.default = '/etc/cf-ipcheck.token';

		/* ---- DNS 解析（r96，可选）----
		 * 这一组只做一件事：把每轮榜首写进 Cloudflare 的一条 A 记录。
		 * 它与「下发」不是一类东西 —— 不碰路由器上任何配置文件，只发两三次 API 请求，
		 * 出事最多是解析不对、删记录就还原。
		 * dns_proxied 故意不暴露：橙云会让 CF 返回它自己的 anycast 地址，客户端根本
		 * 解析不到我们优选的那颗 IP，开关摆在这里只会让人误以为可以切。 */
o = field(dns, 'dns', form.Flag, 'dns_sync',
	_('同步到 Cloudflare DNS'), _('每轮跑完，把结果里的地址更新到下面的域名解析记录。'),
	_('打开后，每轮正常跑完（流量没被代理接管、也没被你叫停）就把结果里靠前的地址写进下面清单的每条记录。内容已经一致就跳过，不会每 6 小时白刷一次。这条路径不修改路由器上任何配置文件。想立刻同步一次：先点页面底部「保存并应用」（没保存时测速程序读不到配置），再切到「榜单」页点「立即写一次 DNS」—— 那个按钮不管这个开关开没开都会执行。'));
		o.rmempty = false;

o = field(dns, 'dns', form.Value, 'dns_zone',
	_('Zone（域名或 ID）'), _('填主域名，例如 example.com（不是具体记录名）。'),
	_('Zone 指这个域名在 Cloudflare 里的管理单元。填域名会先查一次它的 ID；直接填 Cloudflare 给的 32 位 ID 就跳过这一步。注意这里填的是 example.com，不是 cf.example.com 这种具体记录名。'));
		dep(o, 'dns_sync', '1');

		/* 多行文本框。这里有个必须处理的坑：uci 的 option 值不能含换行
		 * （换行会把 /etc/config 写成两行，直接坏掉），所以配置里存成
		 * 「分号分隔的单行」，界面上读写时各转一次。不转的话用户一按保存就写出坏配置。 */
o = field(dns, 'dns', form.TextValue, 'dns_targets',
	_('记录名清单'), _('每行填一条记录：域名、条数；可再加所在地和主域名。'),
	_('每行一条：记录名 条数 [@所在地代码] [主域名]，后三项可省，行首 # 是注释。例：jp.example.com 2 @NRT。条数是这个记录名下挂几条地址（省=1，最多 10），解析时轮流返回，某条连不上会自动落到别的。写 @NRT 只取东京的地址（代码见「榜单」页汇总）；同一个记录名写多行会合并：条数取最大、所在地取并集。该所在地这一轮没有可用地址时，这个记录名会被清空（日志会写明），怕断就再挂一行不带 @ 的兜底。主域名省了用上面的 Zone，两处都空就从记录名推断。只改带 cf-ipcheck 备注的记录，面板上手工加的不会被碰；可用地址不够时按实际写，并在日志里说明。'));
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
	_('TTL（秒）'), _('建议填 60 秒，换地址后生效更快。'),
	_('TTL 是各地缓存这条解析记录的时间（秒）。填 60 意味着换地址后一分钟内客户端就能拿到新地址；填 1 就是缓存 1 秒，不是「自动」，也不会用 Cloudflare 的默认 300 秒。可填 1~86400（一天），数值越大切换越慢。'));
		dep(o, 'dns_sync', '1');
		o.datatype = 'and(uinteger,min(1),max(86400))';
		o.default = '60';

o = field(dns, 'dns', form.Value, 'dns_token',
	_('API 令牌'), _('需要在 Cloudflare 里给「区域 → DNS → 编辑」权限。'),
	_('在 Cloudflare「我的个人资料 → API 令牌」里建一个自定义令牌，权限选 Zone → DNS → Edit（区域 → DNS → 编辑），范围限定到具体域名。它和「Gist 上传」分组里的令牌不是同一个（那个只能改 Gist，调不了 DNS），不要复用。填在这里会以掩码显示，并在升级固件时随配置备份保存；不想让它进配置文件，就用下面的「令牌文件路径」。'));
		dep(o, 'dns_sync', '1');
		o.password = true;

o = field(adv, 'probeAdv', form.Value, 'dns_token_file',
	_('令牌文件路径（备选）'), _('两处都填时，以上面直接填写的 API 令牌为准。'),
	_('把令牌单独写在一个文件里，这里填路径（建议只让所有者可读写），配置文件里就不留明文。两处都填时以直接填写的 API 令牌为准。文件读不到时按「没填令牌」处理，只记一行日志，不会拿空令牌去请求。'));
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
