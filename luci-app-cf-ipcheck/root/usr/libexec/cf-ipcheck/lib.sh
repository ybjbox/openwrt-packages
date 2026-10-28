#!/bin/sh
# cf-ipcheck 引擎与 apply-dns.sh 共用的基础件。
#
# 只放「两边语义必须一模一样」的东西：按绝对路径找可执行文件、IPv4 校验、时间戳。
# 不在这里的东西及原因：
#   log —— 引擎的日志要按 log_max_kb 封顶重写；apply-dns 的 dry-run 走 stdout、
#          手工 ssh 跑时同时写 stderr。合在一起必然改掉其中一边的行为。
#   cfg —— 引擎多了「非纯数字退默认 + 告警缓冲」，apply-dns 只有固定的 10 个键。
#          两边键表与容错口径不同，硬合会把脏配置的处理方式改掉。
# 本文件被 source，不单独执行，所以不需要执行位（100644）。
#
# 参数一律走本文件自己的 _lib_* 变量：调用方是两段长脚本，共用全局名容易互相踩。

# find_bin <名字> <候选绝对路径...>
# rpcd 起子进程时继承的 PATH 可能不含 /sbin（真机实测：uci 在 /sbin/uci，
# 页面触发的那条路径上 command -v 失败 → 整套 uci 配置被静默忽略）。
find_bin() {
	_lib_name=$1
	shift
	for _lib_p in "$@"; do
		[ -x "$_lib_p" ] && { printf '%s' "$_lib_p"; return 0; }
	done
	_lib_path=$(command -v "$_lib_name" 2>/dev/null || true)
	[ -n "$_lib_path" ] && { printf '%s' "$_lib_path"; return 0; }
	return 1
}

# valid_ip4 <字符串> -> 只有纯 IPv4 才返回 0。
# 凡是会进 `su -c` 那条 shell 字符串的地址都必须先过这一关：探测池里的地址是
# grep 提取出来的（天然干净），但 `cf-ipcheck colo <IP>` 的参数是外部输入。
# 空串必须在这里挡掉：awk 一条记录都读不到时退出码是 0，只靠正则会把空参数放行。
valid_ip4() {
	case "${1:-}" in
		''|*[!0-9.]*) return 1 ;;
	esac
	_lib_ifs=$IFS
	IFS=.
	# shellcheck disable=SC2086
	set -- $1
	IFS=$_lib_ifs
	[ $# -eq 4 ] || return 1
	for _lib_o in "$@"; do
		[ -n "$_lib_o" ] || return 1
		if [ "$_lib_o" -lt 0 ] 2>/dev/null || [ "$_lib_o" -gt 255 ] 2>/dev/null; then
			return 1
		fi
	done
	return 0
}

# 本地时间 + 偏移（日志用；状态 JSON 仍写 UTC 的 ...Z，由页面转本地）
now_iso() {
	date '+%Y-%m-%dT%H:%M:%S%z' 2>/dev/null || printf '%s' '-'
}
