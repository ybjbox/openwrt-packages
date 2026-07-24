#!/bin/sh
# run_busybox_test.sh — 在 BusyBox (alpine 容器) 环境直接运行已提交的生产热修补脚本,
# 验证 DHCP 段 4 处 sed 注入正确且产物 JS 语法有效。
#
# CI 的核心价值之一: 用 BusyBox 的 sed/grep/sh 真跑生产脚本, 复现路由器真机行为
# (BusyBox sed 不支持 N+\n 跨行匹配, 且对替代串 \n 的处理与 GNU 不同 —— 脚本已量产校验)。
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DHCP_JS="/www/luci-static/resources/view/network/dhcp.js"
FIXTURE="$REPO_ROOT/tests/fixtures/dhcp_host_section.js"
PATCH="$REPO_ROOT/luci-app-dhcp-comment/root/etc/uci-defaults/99-luci-app-dhcp-comment"

# ---------- 准备 fixture ----------
echo "[busybox-test] 准备 fixture -> $DHCP_JS"
mkdir -p "$(dirname "$DHCP_JS")"
cp "$FIXTURE" "$DHCP_JS"

# ---------- 运行生产热修补脚本 ----------
echo "[busybox-test] 运行生产热修补脚本: $PATCH"
sh "$PATCH"

# ---------- 断言 ----------
# 用 grep -F (固定串) 避免锚点里的 ( { * 等被当作正则元字符
assert_contains() {
    # $1 = 描述, $2 = 待匹配固定串
    if ! grep -Fq -- "$2" "$DHCP_JS"; then
        echo "FAIL: $1 (未找到: $2)"
        exit 1
    fi
    echo "[busybox-test] ok: $1"
}

echo "[busybox-test] 断言注入结果"
assert_contains "备注列(comment)已注入" "co=ss.option(form.Value,'comment'"
assert_contains "max_cols 已改为 9" "max_cols=9"
assert_contains "mac_comments 初始化已注入" "var mac_comments={};try{uci.sections"
assert_contains "租约列 comment 查找已注入" "'%s'.format((function()"

# 列顺序: name -> comment -> mac (连续)
# 用 node 解析文件中 ss.option(form.(Value|DynamicList),'<name>' 的出现顺序。
echo "[busybox-test] 断言列顺序 name->comment->mac"
node -e "
const fs=require('fs');
const src=fs.readFileSync(process.argv[1],'utf8');
const re=/ss\.option\(form\.(?:Value|DynamicList),\s*'([^']+)'/g;
let m, names=[];
while((m=re.exec(src))!==null) names.push(m[1]);
const iName=names.indexOf('name');
const iComment=names.indexOf('comment');
const iMac=names.indexOf('mac');
if(iName<0||iComment<0||iMac<0){
  console.error('FAIL: 缺少期望列 name/comment/mac -> '+JSON.stringify(names));
  process.exit(1);
}
if(names[iName+1]!=='comment'){
  console.error('FAIL: name 之后不是 comment -> '+JSON.stringify(names));
  process.exit(1);
}
if(names[iComment+1]!=='mac'){
  console.error('FAIL: comment 之后不是 mac -> '+JSON.stringify(names));
  process.exit(1);
}
console.log('[busybox-test] column order: '+JSON.stringify(names));
" "$DHCP_JS" || { echo "FAIL: 列顺序断言未通过"; exit 1; }

# 语法有效性: 注入后整文件必须仍是合法 JS
echo "[busybox-test] node --check 语法校验"
node --check "$DHCP_JS" || { echo "FAIL: node --check 未通过"; exit 1; }

echo "[busybox-test] PASS"
