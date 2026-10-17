import fs from 'node:fs';
const src0 = fs.readFileSync('luci-app-cf-ipcheck/htdocs/luci-static/resources/view/cf_ipcheck/settings.js', 'utf8');
const strings = [...src0.matchAll(/(?:^|[^\w$])(?:T|_)\(\s*'((?:[^'\\]|\\.)*)'/gm)].map(m => m[1]);
console.log('抓到 ' + strings.length + ' 条用户可见串');
const hit = (re, label) => {
	const f = strings.filter(s => re.test(s));
	console.log(label + ': ' + f.length);
	f.slice(0, 6).forEach(h => console.log('   >>> ' + h.slice(0, 130)));
};
hit(/（r\d\d/, '内部改动号');
hit(/body/, '英文 body');
hit(/入围/, '入围');
hit(/重新读取|开始检测|重新检测/, '旧按钮名');
hit(/\*\*|__|`/, 'markdown 记号');
