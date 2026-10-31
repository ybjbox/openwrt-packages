(function (CFI) {
	'use strict';

	/* ---- 导航：只认 #/cfi/<zone>[/<sub>[/<arg>]] --------------------------
	 * 旧版 #cf-tab= 前缀一律不识别（2026-10-29 重设计时明确重置），
	 * 落默认区。开抽屉用 pushState（Back 即关），切区用 replaceState。 */
	var ZONES = [ 'run', 'diag', 'logs', 'set' ];

	function parseRoute(hash) {
		var h = String(hash || '').replace(/^#\/?/, '');
		var parts = h.split('/').filter(function (x) { return x !== ''; });
		if (!parts.length || parts[0] !== 'cfi')
			return null;
		var zone = parts[1];
		if (ZONES.indexOf(zone) < 0)
			return null;
		return {
			zone: zone,
			sub: parts[2] || '',
			arg: parts[3] ? decodeURIComponent(parts[3]) : ''
		};
	}

	function routeHash(zone, sub, arg) {
		var h = '#/cfi/' + zone;
		if (sub)
			h += '/' + sub;
		if (arg)
			h += '/' + encodeURIComponent(arg);
		return h;
	}

	function writeRoute(zone, sub, arg, push) {
		try {
			var h = routeHash(zone, sub, arg);
			if (window.location && window.location.hash === h)
				return;
			if (push && window.history && window.history.pushState)
				window.history.pushState(null, '', h);
			else if (window.history && window.history.replaceState)
				window.history.replaceState(null, '', h);
		} catch (e) {}
	}

	/* ---- 本地偏好：新前缀 cfi3.*；旧键一律不读不删 ---------------------- */
	var NS = 'cfi3.';

	function lsGet(key, def) {
		try {
			var v = window.localStorage.getItem(key);
			return v == null ? def : v;
		} catch (e) {
			return def;
		}
	}

	function lsSet(key, val) {
		try { window.localStorage.setItem(key, String(val)); } catch (e) {}
	}

	function getBool(key, def) {
		var v = lsGet(key, '');
		if (v === '1') return true;
		if (v === '0') return false;
		return !!def;
	}

	function savedZone() {
		var z = lsGet(NS + 'zone', '');
		return ZONES.indexOf(z) >= 0 ? z : null;
	}

	function rememberZone(zone) {
		lsSet(NS + 'zone', zone);
	}

	/* ---- dns_targets：uci 单行文本（; 分隔）⇄ 行清单 --------------------
	 * uci 的 option 值不能含换行（写进去会坏配置文件），所以存储形态是
	 * a 1; b 2 这种单行。解析同时接受分号与换行（手工编辑/环境变量），
	 * 回写统一用分号加空格 —— 往返字节不变。 */
	var DNS_LIMIT = 10;

	function dnsLinesOf(text) {
		var out = [];
		var all = String(text || '');
		if (all === '')
			return out;
		all.split(/\r?\n|;/).forEach(function (line) {
			var t = String(line).replace(/^\s+|\s+$/g, '');
			if (!t || t.charAt(0) === '#' || t.indexOf('.') < 0) {
				out.push({ kind: 'raw', text: t });
				return;
			}
			var tok = t.split(/\s+/);
			var count = 1;
			if (tok[1] && /^\d+$/.test(tok[1]))
				count = Number(tok[1]);
			var code = '';
			var rest = [];
			for (var k = 1; k < tok.length; k++) {
				var x = tok[k];
				if (k === 1 && /^\d+$/.test(x))
					continue;
				if (x.charAt(0) === '@' && /^[A-Za-z]{3}$/.test(x.slice(1)))
					code = x.slice(1).toUpperCase();
				else
					rest.push(x);
			}
			out.push({ kind: 'row', row: { domain: tok[0], count: count, code: code, rest: rest } });
		});
		return out;
	}

	function dnsTextOf(lines) {
		var src = lines || [];
		while (src.length && src[src.length - 1] && src[src.length - 1].kind === 'raw' &&
			String(src[src.length - 1].text || '').trim() === '')
			src = src.slice(0, -1);
		return src.map(function (ln) {
			if (!ln || ln.kind !== 'row')
				return ln && ln.text != null ? ln.text : '';
			var r = ln.row;
			var s = r.domain + ' ' + (r.count || 1);
			if (r.code)
				s += ' @' + r.code;
			(Array.isArray(r.rest) ? r.rest : []).forEach(function (x) { s += ' ' + x; });
			return s.replace(/\s+$/, '');
		}).join('; ');
	}

	/* ---- Cloudflare 机房码 → 中文城市名 --------------------------------
	 * colo 是 IATA 机场码（NRT/KIX/LAX…），对不熟悉机场码的人是噪声。
	 * 只做悬停提示，不改榜单里显示的原码；表里没有的码返回空串，不猜。 */
	var COLO_CITY = {
		/* 日本 */
		NRT: '东京', HND: '东京', KIX: '大阪', ITM: '大阪', NGO: '名古屋',
		CTS: '札幌', FUK: '福冈', OKA: '冲绳', SDJ: '仙台', HIJ: '广岛',
		KOJ: '鹿儿岛', NGS: '长崎', OIT: '大分', KMQ: '金泽', TOY: '富山',
		OKJ: '冈山', TAK: '高松', MYJ: '松山', FSZ: '静冈', IBR: '茨城',
		/* 亚洲其它 */
		ICN: '首尔', GMP: '首尔', PUS: '釜山', TPE: '台北', TSA: '台北', KHH: '高雄',
		HKG: '香港', MFM: '澳门', SIN: '新加坡', BKK: '曼谷', DMK: '曼谷',
		CNX: '清迈', HKT: '普吉', KUL: '吉隆坡', PEN: '槟城', CGK: '雅加达',
		DPS: '登巴萨', SUB: '泗水', MNL: '马尼拉', CEB: '宿务', SGN: '胡志明市',
		HAN: '河内', PNH: '金边', RGN: '仰光', DEL: '新德里', BOM: '孟买',
		BLR: '班加罗尔', MAA: '金奈', CCU: '加尔各答', HYD: '海得拉巴', COK: '科钦',
		AMD: '艾哈迈达巴德', DAC: '达卡', CMB: '科伦坡', KTM: '加德满都',
		ISB: '伊斯兰堡', KHI: '卡拉奇', LHE: '拉合尔', MLE: '马累',
		TAS: '塔什干', ALA: '阿拉木图',
		/* 大洋洲 */
		SYD: '悉尼', MEL: '墨尔本', BNE: '布里斯班', PER: '珀斯', ADL: '阿德莱德',
		CBR: '堪培拉', AKL: '奥克兰', WLG: '惠灵顿', CHC: '基督城', NAN: '楠迪',
		HNL: '檀香山', GUM: '关岛',
		/* 北美 */
		LAX: '洛杉矶', SFO: '旧金山', SJC: '圣何塞', OAK: '奥克兰', SEA: '西雅图',
		PDX: '波特兰', SMF: '萨克拉门托', SAN: '圣地亚哥', LAS: '拉斯维加斯',
		PHX: '凤凰城', DEN: '丹佛', SLC: '盐湖城', DFW: '达拉斯', IAH: '休斯顿',
		AUS: '奥斯汀', SAT: '圣安东尼奥', ORD: '芝加哥', MSP: '明尼阿波利斯',
		DTW: '底特律', STL: '圣路易斯', ATL: '亚特兰大', MIA: '迈阿密',
		MCO: '奥兰多', TPA: '坦帕', CLT: '夏洛特', RDU: '罗利', IAD: '华盛顿',
		BWI: '巴尔的摩', PHL: '费城', EWR: '纽瓦克', JFK: '纽约', LGA: '纽约',
		BOS: '波士顿', BUF: '布法罗', CLE: '克利夫兰', CMH: '哥伦布',
		IND: '印第安纳波利斯', CVG: '辛辛那提', BNA: '纳什维尔', MEM: '孟菲斯',
		MSY: '新奥尔良', MCI: '堪萨斯城', OMA: '奥马哈', OKC: '俄克拉何马城',
		ANC: '安克雷奇',
		YYZ: '多伦多', YVR: '温哥华', YUL: '蒙特利尔', YYC: '卡尔加里',
		YEG: '埃德蒙顿', YOW: '渥太华', YHZ: '哈利法克斯', YWG: '温尼伯',
		/* 拉美 */
		MEX: '墨西哥城', GDL: '瓜达拉哈拉', MTY: '蒙特雷', CUN: '坎昆', TIJ: '蒂华纳',
		GRU: '圣保罗', GIG: '里约热内卢', CNF: '贝洛奥里藏特', POA: '阿雷格里港',
		CWB: '库里蒂巴', FLN: '弗洛里亚诺波利斯', FOR: '福塔莱萨', REC: '累西腓',
		SSA: '萨尔瓦多', BSB: '巴西利亚', EZE: '布宜诺斯艾利斯', SCL: '圣地亚哥',
		LIM: '利马', BOG: '波哥大', MDE: '麦德林', UIO: '基多',
		MVD: '蒙得维的亚', ASU: '亚松森', LPB: '拉巴斯', CCS: '加拉加斯',
		/* 欧洲 */
		LHR: '伦敦', LGW: '伦敦', LCY: '伦敦', MAN: '曼彻斯特', BHX: '伯明翰',
		EDI: '爱丁堡', DUB: '都柏林', CDG: '巴黎', ORY: '巴黎', MRS: '马赛',
		LYS: '里昂', AMS: '阿姆斯特丹', BRU: '布鲁塞尔', LUX: '卢森堡',
		FRA: '法兰克福', MUC: '慕尼黑', BER: '柏林', DUS: '杜塞尔多夫',
		HAM: '汉堡', STR: '斯图加特', CGN: '科隆', VIE: '维也纳', ZRH: '苏黎世',
		GVA: '日内瓦', BSL: '巴塞尔', MAD: '马德里', BCN: '巴塞罗那',
		LIS: '里斯本', OPO: '波尔图', FCO: '罗马', MXP: '米兰', LIN: '米兰',
		VCE: '威尼斯', NAP: '那不勒斯', PMO: '巴勒莫', ATH: '雅典',
		SKG: '塞萨洛尼基', IST: '伊斯坦布尔', SAW: '伊斯坦布尔', WAW: '华沙',
		KRK: '克拉科夫', PRG: '布拉格', BUD: '布达佩斯', OTP: '布加勒斯特',
		SOF: '索菲亚', ZAG: '萨格勒布', BEG: '贝尔格莱德', LJU: '卢布尔雅那',
		CPH: '哥本哈根', ARN: '斯德哥尔摩', GOT: '哥德堡', OSL: '奥斯陆',
		HEL: '赫尔辛基', TLL: '塔林', RIX: '里加', VNO: '维尔纽斯',
		KEF: '雷克雅未克', SVO: '莫斯科', DME: '莫斯科', LED: '圣彼得堡',
		KBP: '基辅', MSQ: '明斯克', TBS: '第比利斯', EVN: '埃里温', GYD: '巴库',
		/* 中东与非洲 */
		DXB: '迪拜', AUH: '阿布扎比', SHJ: '沙迦', DOH: '多哈', RUH: '利雅得',
		JED: '吉达', DMM: '达曼', KWI: '科威特城', BAH: '麦纳麦', MCT: '马斯喀特',
		AMM: '安曼', TLV: '特拉维夫', BEY: '贝鲁特', CAI: '开罗',
		CMN: '卡萨布兰卡', RAK: '马拉喀什', TUN: '突尼斯', ALG: '阿尔及尔',
		JNB: '约翰内斯堡', CPT: '开普敦', DUR: '德班', LOS: '拉各斯',
		ABV: '阿布贾', ACC: '阿克拉', NBO: '内罗毕', ADD: '亚的斯亚贝巴',
		DAR: '达累斯萨拉姆', EBB: '坎帕拉', KGL: '基加利', LAD: '罗安达', MRU: '路易港'
	};

	function coloName(code) {
		var c = String(code || '').toUpperCase();
		return Object.prototype.hasOwnProperty.call(COLO_CITY, c) ? COLO_CITY[c] : '';
	}

	/* ---- 日志 ---------------------------------------------------------- */
	function logTone(line) {
		if (/失败|错误|中止|写不动|不是字符设备|找不到|没有 curl/.test(line))
			return 'bad';
		if (/已请求停止|被丢弃|已忽略|低于下限|超过上限|跳过/.test(line))
			return 'warn';
		return '';
	}

	var LOG_TS_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})([+-]\d{2}):?(\d{2})/;

	function logStamp(ln, full) {
		var m = LOG_TS_RE.exec(ln);
		if (!m)
			return null;
		var p = function (n) { return n < 10 ? '0' + n : String(n); };
		var now = new Date();
		var ymd = m[1] + '-' + m[2] + '-' + m[3];
		var hmss = m[4] + ':' + m[5] + ':' + m[6];
		if (full)
			return { shown: ln.slice(0, m[0].length), title: ln.slice(0, m[0].length), rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
		var today = now.getFullYear() + '-' + p(now.getMonth() + 1) + '-' + p(now.getDate());
		var yd = new Date(now.getTime() - 86400000);
		var yesterday = yd.getFullYear() + '-' + p(yd.getMonth() + 1) + '-' + p(yd.getDate());
		var shown;
		if (ymd === today)
			shown = hmss;
		else if (ymd === yesterday)
			shown = CFI.T('昨天') + ' ' + hmss;
		else if (m[1] === String(now.getFullYear()))
			shown = m[2] + '-' + m[3] + ' ' + hmss;
		else
			shown = ymd + ' ' + hmss;
		return { shown: shown, title: ln.slice(0, m[0].length), rest: ln.slice(m[0].length).replace(/^[ \t]+/, '') };
	}

	CFI.nav = { ZONES: ZONES, parseRoute: parseRoute, routeHash: routeHash, writeRoute: writeRoute };
	CFI.prefs = {
		NS: NS, get: lsGet, set: lsSet, getBool: getBool,
		savedZone: savedZone, rememberZone: rememberZone
	};
	CFI.dns = { LIMIT: DNS_LIMIT, linesOf: dnsLinesOf, textOf: dnsTextOf };
	CFI.colo = { name: coloName };
	CFI.log = { tone: logTone, stamp: logStamp, TS_RE: LOG_TS_RE };
})(CFI);
