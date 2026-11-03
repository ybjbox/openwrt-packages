#!/bin/sh
# mock-cf-curl.sh —— CI 用的假 curl，只为验证 apply-dns.sh 的写路径
#
# 为什么需要它：多目标写路径里「该删哪几条、该留哪几条」的判据必须靠真实 API
# 响应形状才能验，而拿真令牌在真 zone 上试错的代价正是「误删别人记录」。
# 这个假 curl 把 Cloudflare API 的四个调用（查 zone / 列记录 / 新建 / 删除）
# 用本地文件模拟，能在离线状态下把整条写路径、回读校验、总结行全跑一遍。
#
# 记录存储在 $MOCK_STORE，每行：<zone_id>|<name>|<record_id>|<content>|<comment>
# 它不联网、不碰系统，只用来断言 apply-dns.sh 的行为。

STORE="${MOCK_STORE:-/tmp/mock-cf/records}"
mkdir -p "$(dirname "$STORE")" 2>/dev/null
touch "$STORE" 2>/dev/null

method=GET; url=''; body=''
while [ $# -gt 0 ]; do
	case "$1" in
		-X) shift; method="$1" ;;
		--data) shift; body="$1" ;;
		--max-time|-H) shift ;;
		*) url="$1" ;;
	esac
	shift
done

zid_of() { printf '%s' "$1" | md5sum | cut -c1-32; }

# 把记录转成 Cloudflare 风格的 JSON
emit_records() {
	_name=$1
	awk -F'|' -v n="$_name" '
		BEGIN { printf "{\"success\":true,\"result\":[" ; first=1 }
		$2 == n {
			if (!first) printf ","
			first=0
			gsub(/"/,"",$3); gsub(/"/,"",$4); gsub(/"/,"",$5)
			printf "{\"id\":\"%s\",\"content\":\"%s\",\"comment\":\"%s\"}", $3, $4, $5
		}
		END { print "]}" }
	' "$STORE"
}

case "$url" in
	*/zones\?name=*)
		_z=${url#*name=}
		printf '{"success":true,"result":[{"id":"%s"}]}\n' "$(zid_of "$_z")"
		;;
	*/dns_records\?type=A*)
		_n=${url#*name=}
		_n=${_n%%&*}
		emit_records "$_n"
		;;
	*/dns_records)
		# 从路径里取 zone id：/zones/<zid>/dns_records
		ZID=$(printf '%s' "$url" | sed -n 's|.*/zones/\([^/]*\)/.*|\1|p')
		if [ "$method" = POST ]; then
			_n=$(printf '%s' "$body" | jq -r .name)
			_c=$(printf '%s' "$body" | jq -r .content)
			_m=$(printf '%s' "$body" | jq -r '.comment // ""')
			_rid=$(printf '%s%s%s' "$_n" "$_c" "$$" | md5sum | cut -c1-32)
			printf '%s|%s|%s|%s|%s\n' "$ZID" "$_n" "$_rid" "$_c" "$_m" >> "$STORE"
			# 请求轨迹：用来断言"先加后删"的顺序（store 的最终内容看不出顺序）
			printf 'POST|%s|%s\n' "$_n" "$_c" >> "$STORE.trace"
			printf '{"success":true,"result":{"id":"%s","content":"%s"}}\n' "$_rid" "$_c"
		else
			printf '{"success":false,"errors":[{"message":"unexpected method"}]}\n'
		fi
		;;
	*/dns_records/*)
		_rid=${url##*/}
		if [ "$method" = DELETE ]; then
			_name_of=$(awk -F'|' -v r="$_rid" '$3==r{print $2}' "$STORE" | head -1)
			_content_of=$(awk -F'|' -v r="$_rid" '$3==r{print $4}' "$STORE" | head -1)
			printf 'DELETE|%s|%s\n' "$_name_of" "$_content_of" >> "$STORE.trace"
			awk -F'|' -v r="$_rid" '$3 != r' "$STORE" > "$STORE.tmp" && mv "$STORE.tmp" "$STORE"
			printf '{"success":true,"result":{"id":"%s"}}\n' "$_rid"
		elif [ "$method" = PATCH ]; then
			_c=$(printf '%s' "$body" | jq -r .content)
			_rid_esc=$(printf '%s' "$_rid" | sed 's/[\/&]/\\&/g')
			awk -F'|' -v r="$_rid" -v c="$_c" 'BEGIN{OFS="|"} $3==r {$4=c} {print}' "$STORE" > "$STORE.tmp" && mv "$STORE.tmp" "$STORE"
			printf '{"success":true,"result":{"id":"%s","content":"%s"}}\n' "$_rid" "$_c"
		fi
		;;
	*)
		printf '{"success":false,"errors":[{"message":"mock: unknown url %s"}]}\n' "$url"
		;;
esac
