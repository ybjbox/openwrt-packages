'use strict';'require view';'require ui';'require uci';'require rpc';'require poll';var BANDIX_COLOR_UPLOAD='#f97316';var BANDIX_COLOR_DOWNLOAD='#06b6d4';var BANDIX_TOOLTIP_BG_OPENWRT2020_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_OPENWRT2020_DARK='#2a2a2a';var BANDIX_TOOLTIP_BG_MATERIAL_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_MATERIAL_DARK='#303030';var BANDIX_TOOLTIP_BG_BOOTSTRAP_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_BOOTSTRAP_DARK='#303030';var BANDIX_TOOLTIP_BG_ARGON_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_ARGON_DARK='#252526';var BANDIX_TOOLTIP_BG_AURORA_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_AURORA_DARK='#0E172B';var BANDIX_TOOLTIP_BG_KUCAT_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_KUCAT_DARK='#222D3C';var BANDIX_MODAL_BG_OPENWRT2020_LIGHT='#ffffff';var BANDIX_MODAL_BG_OPENWRT2020_DARK='#2a2a2a';var BANDIX_MODAL_BG_MATERIAL_LIGHT='#ffffff';var BANDIX_MODAL_BG_MATERIAL_DARK='#303030';var BANDIX_MODAL_BG_BOOTSTRAP_LIGHT='#ffffff';var BANDIX_MODAL_BG_BOOTSTRAP_DARK='#303030';var BANDIX_MODAL_BG_ARGON_LIGHT='#F4F5F7';var BANDIX_MODAL_BG_ARGON_DARK='#252526';var BANDIX_MODAL_BG_AURORA_LIGHT='#ffffff';var BANDIX_MODAL_BG_AURORA_DARK='#0E172B';var BANDIX_MODAL_BG_KUCAT_LIGHT='#222D3C';var BANDIX_MODAL_BG_KUCAT_DARK='#222D3C';var BANDIX_TOOLTIP_BG_LIGHT='#ffffff';var BANDIX_TOOLTIP_BG_DARK='#333333';function getThemeMode(){var theme=L.uci.get('luci','main','mediaurlbase');if(theme==='/luci-static/openwrt2020'||theme==='/luci-static/material'||theme==='/luci-static/bootstrap-light'){return'light';}
if(theme==='/luci-static/bootstrap-dark'){return'dark';}
if(theme==='/luci-static/argon'){var argonMode=L.uci.get('argon','@global[0]','mode');if(argonMode==='light'){return'light';}
if(argonMode==='dark'){return'dark';}
var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;return prefersDark?'dark':'light';}
if(theme==='/luci-static/bootstrap'||theme==='/luci-static/aurora'){var htmlElement=document.documentElement;var darkMode=htmlElement.getAttribute('data-darkmode');return darkMode==='true'?'dark':'light';}
if(theme==='/luci-static/kucat'){var kucatMode=L.uci.get('kucat','@basic[0]','mode');if(kucatMode==='light'){return'light';}
if(kucatMode==='dark'){return'dark';}
var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;return prefersDark?'dark':'light';}
var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;return prefersDark?'dark':'light';}
function getThemeColors(){var theme=L.uci.get('luci','main','mediaurlbase');var mode=getThemeMode();if(theme==='/luci-static/openwrt2020'){return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_OPENWRT2020_DARK:BANDIX_TOOLTIP_BG_OPENWRT2020_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_OPENWRT2020_DARK:BANDIX_MODAL_BG_OPENWRT2020_LIGHT};}
if(theme==='/luci-static/material'){return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_MATERIAL_DARK:BANDIX_TOOLTIP_BG_MATERIAL_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_MATERIAL_DARK:BANDIX_MODAL_BG_MATERIAL_LIGHT};}
if(theme==='/luci-static/bootstrap-light'||theme==='/luci-static/bootstrap'){return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_BOOTSTRAP_DARK:BANDIX_TOOLTIP_BG_BOOTSTRAP_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_BOOTSTRAP_DARK:BANDIX_MODAL_BG_BOOTSTRAP_LIGHT};}
if(theme==='/luci-static/bootstrap-dark'){return{tooltipBg:BANDIX_TOOLTIP_BG_BOOTSTRAP_DARK,modalBg:BANDIX_MODAL_BG_BOOTSTRAP_DARK};}
if(theme==='/luci-static/argon'){return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_ARGON_DARK:BANDIX_TOOLTIP_BG_ARGON_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_ARGON_DARK:BANDIX_MODAL_BG_ARGON_LIGHT};}
if(theme==='/luci-static/aurora'){return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_AURORA_DARK:BANDIX_TOOLTIP_BG_AURORA_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_AURORA_DARK:BANDIX_MODAL_BG_AURORA_LIGHT};}
if(theme==='/luci-static/kucat'){return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_KUCAT_DARK:BANDIX_TOOLTIP_BG_KUCAT_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_KUCAT_DARK:BANDIX_MODAL_BG_KUCAT_LIGHT};}
return{tooltipBg:mode==='dark'?BANDIX_TOOLTIP_BG_OPENWRT2020_DARK:BANDIX_TOOLTIP_BG_OPENWRT2020_LIGHT,modalBg:mode==='dark'?BANDIX_MODAL_BG_OPENWRT2020_DARK:BANDIX_MODAL_BG_OPENWRT2020_LIGHT};}
function getThemeType(){var mediaUrlBase=L.uci.get('luci','main','mediaurlbase');if(!mediaUrlBase){var linkTags=document.querySelectorAll('link[rel="stylesheet"]');for(var i=0;i<linkTags.length;i++){var href=linkTags[i].getAttribute('href')||'';if(href.toLowerCase().includes('argon')){return'wide';}}
return'narrow';}
var mediaUrlBaseLower=mediaUrlBase.toLowerCase();var wideThemeKeywords=['argon','material','design','edge'];for(var i=0;i<wideThemeKeywords.length;i++){if(mediaUrlBaseLower.includes(wideThemeKeywords[i])){return'wide';}}
return'narrow';}
function formatSize(bytes){if(bytes===0)return'0 B';const units=['B','KB','MB','GB','TB','PB'];const i=Math.floor(Math.log(bytes)/Math.log(1024));return parseFloat((bytes/Math.pow(1024,i)).toFixed(2))+' '+units[i];}
function formatByterate(bytes_per_sec,unit){if(bytes_per_sec===0){return unit==='bits'?'0 bps':'0 B/s';}
if(unit==='bits'){const bits_per_sec=bytes_per_sec*8;const units=['bps','Kbps','Mbps','Gbps','Tbps'];const i=Math.floor(Math.log(bits_per_sec)/Math.log(1000));return parseFloat((bits_per_sec/Math.pow(1000,i)).toFixed(2))+' '+units[i];}else{const units=['B/s','KB/s','MB/s','GB/s','TB/s'];const i=Math.floor(Math.log(bytes_per_sec)/Math.log(1024));return parseFloat((bytes_per_sec/Math.pow(1024,i)).toFixed(2))+' '+units[i];}}
function getConnectionTypeIcon(connectionType){if(!connectionType)return null;var iconSize=14;if(connectionType==='wifi'){var wifiIcon=E('img',{'src':'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXdpZmktaWNvbiBsdWNpZGUtd2lmaSI+PHBhdGggZD0iTTEyIDIwaC4wMSIvPjxwYXRoIGQ9Ik0yIDguODJhMTUgMTUgMCAwIDEgMjAgMCIvPjxwYXRoIGQ9Ik01IDEyLjg1OWExMCAxMCAwIDAgMSAxNCAwIi8+PHBhdGggZD0iTTguNSAxNi40MjlhNSA1IDAgMCAxIDcgMCIvPjwvc3ZnPg==','width':iconSize,'height':iconSize,'alt':'WiFi','style':'vertical-align: middle; display: inline-block; opacity: 0.8;'});return wifiIcon;}else if(connectionType==='router'){var routerIcon=E('img',{'src':'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLXJvdXRlci1pY29uIGx1Y2lkZS1yb3V0ZXIiPjxyZWN0IHdpZHRoPSIyMCIgaGVpZ2h0PSI4IiB4PSIyIiB5PSIxNCIgcng9IjIiLz48cGF0aCBkPSJNNi4wMSAxOEg2Ii8+PHBhdGggZD0iTTEwLjAxIDE4SDEwIi8+PHBhdGggZD0iTTE1IDEwdjQiLz48cGF0aCBkPSJNMTcuODQgNy4xN2E0IDQgMCAwIDAtNS42NiAwIi8+PHBhdGggZD0iTTIwLjY2IDQuMzRhOCA4IDAgMCAwLTExLjMxIDAiLz48L3N2Zz4=','width':iconSize,'height':iconSize,'alt':'Router','style':'vertical-align: middle; display: inline-block; opacity: 0.8;'});return routerIcon;}else{var ethernetIcon=E('img',{'src':'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGNsYXNzPSJsdWNpZGUgbHVjaWRlLWV0aGVybmV0LXBvcnQtaWNvbiBsdWNpZGUtZXRoZXJuZXQtcG9ydCI+PHBhdGggZD0ibTE1IDIwIDMtM2gyYTIgMiAwIDAgMCAyLTJWNmEyIDIgMCAwIDAtMi0ySDRhMiAyIDAgMCAwLTIgMnY5YTIgMiAwIDAgMCAyIDJoMmwzIDN6Ii8+PHBhdGggZD0iTTYgOHYxIi8+PHBhdGggZD0iTTEwIDh2MSIvPjxwYXRoIGQ9Ik0xNCA4djEiLz48cGF0aCBkPSJNMTggOHYxIi8+PC9zdmc+','width':iconSize,'height':iconSize,'alt':'Ethernet','style':'vertical-align: middle; display: inline-block; opacity: 0.8;'});return ethernetIcon;}}
function parseSpeed(speedStr){if(!speedStr||speedStr==='0'||speedStr==='0 B/s'||speedStr==='0 bps')return 0;const bytesMatch=speedStr.match(/^([\d.]+)\s*([KMGT]?B\/s)$/i);if(bytesMatch){const value=parseFloat(bytesMatch[1]);const unit=bytesMatch[2].toUpperCase();const bytesMultipliers={'B/S':1,'KB/S':1024,'MB/S':1024*1024,'GB/S':1024*1024*1024,'TB/S':1024*1024*1024*1024};return value*(bytesMultipliers[unit]||1);}
const bitsMatch=speedStr.match(/^([\d.]+)\s*([KMGT]?bps)$/i);if(bitsMatch){const value=parseFloat(bitsMatch[1]);const unit=bitsMatch[2].toLowerCase();const bitsMultipliers={'bps':1,'kbps':1000,'mbps':1000*1000,'gbps':1000*1000*1000,'tbps':1000*1000*1000*1000};return(value*(bitsMultipliers[unit]||1))/8;}
return 0;}
function filterLanIPv6(ipv6Addresses){if(!ipv6Addresses||!Array.isArray(ipv6Addresses))return[];const lanPrefixes=['fd','fc'];const lanAddresses=ipv6Addresses.filter(addr=>{const lowerAddr=addr.toLowerCase();return lanPrefixes.some(prefix=>lowerAddr.startsWith(prefix));});return lanAddresses.slice(0,2);}
function getTimeRangeForPeriod(period){if(period==='all'){return{start_ms:null,end_ms:null};}
var now=new Date();var startDate;var endDate;switch(period){case'today':startDate=new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0,0);endDate=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999);break;case'week':var day=now.getDay();var diff=day===0?6:day-1;startDate=new Date(now.getFullYear(),now.getMonth(),now.getDate()-diff,0,0,0,0);endDate=new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate()+6,23,59,59,999);break;case'month':startDate=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);endDate=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999);break;case'year':startDate=new Date(now.getFullYear(),0,1,0,0,0,0);endDate=new Date(now.getFullYear(),11,31,23,59,59,999);break;default:return{start_ms:null,end_ms:null};}
return{start_ms:startDate.getTime(),end_ms:endDate.getTime()};}
var callStatus=rpc.declare({object:'luci.bandix',method:'getStatus',params:['start_ms','end_ms'],expect:{}});var callSetHostname=rpc.declare({object:'luci.bandix',method:'setHostname',params:['mac','hostname'],expect:{success:true}});var callGetMetrics=rpc.declare({object:'luci.bandix',method:'getMetrics',params:['mac'],expect:{}});var callGetScheduleLimits=rpc.declare({object:'luci.bandix',method:'getScheduleLimits',expect:{}});var callSetScheduleLimit=rpc.declare({object:'luci.bandix',method:'setScheduleLimit',params:['mac','start_time','end_time','days','wan_tx_rate_limit','wan_rx_rate_limit'],expect:{success:true}});var callUpdateScheduleLimit=rpc.declare({object:'luci.bandix',method:'updateScheduleLimit',params:['id','mac','start_time','end_time','days','wan_rx_rate_limit','wan_tx_rate_limit'],expect:{success:true}});var callDeleteScheduleLimit=rpc.declare({object:'luci.bandix',method:'deleteScheduleLimit',params:['id'],expect:{success:true}});var callGetVersion=rpc.declare({object:'luci.bandix',method:'getVersion',expect:{}});var callCheckUpdate=rpc.declare({object:'luci.bandix',method:'checkUpdate',expect:{}});var callGetTrafficUsageRanking=rpc.declare({object:'luci.bandix',method:'getTrafficUsageRanking',params:['start_ms','end_ms','network_type']});var callGetTrafficUsageIncrements=rpc.declare({object:'luci.bandix',method:'getTrafficUsageIncrements',params:['start_ms','end_ms','aggregation','mac','network_type']});var callGetRateLimitWhitelist=rpc.declare({object:'luci.bandix',method:'getRateLimitWhitelist',expect:{}});var callSetRateLimitWhitelistEnabled=rpc.declare({object:'luci.bandix',method:'setRateLimitWhitelistEnabled',params:['enabled'],expect:{}});var callAddRateLimitWhitelist=rpc.declare({object:'luci.bandix',method:'addRateLimitWhitelist',params:['mac'],expect:{}});var callDeleteRateLimitWhitelist=rpc.declare({object:'luci.bandix',method:'deleteRateLimitWhitelist',params:['mac'],expect:{}});var callDeleteDevice=rpc.declare({object:'luci.bandix',method:'deleteDevice',params:['mac'],expect:{}});var callSetDefaultRateLimit=rpc.declare({object:'luci.bandix',method:'setDefaultRateLimit',params:['wan_rx_rate_limit','wan_tx_rate_limit'],expect:{}});
L.getDHCPCommentUniversal = function(mac, ip, name) {
    try {
        var dhcp_comments = {};
        var dhcp_list = [];
        uci.sections("dhcp", "host").forEach(function(s){
            if (s.comment) {
                var cmt = s.comment;
                dhcp_list.push({ comment: cmt, name: s.name ? s.name.toLowerCase() : null, ip: s.ip });
                if (s.name) dhcp_comments[s.name.toLowerCase()] = cmt;
                if (s.ip) dhcp_comments[s.ip] = cmt;
                L.toArray(s.mac).forEach(function(m){ if (m) dhcp_comments[m.toLowerCase()] = cmt; });
                dhcp_comments[cmt.toLowerCase()] = cmt;
            }
        });
        var k1 = mac ? mac.toLowerCase() : null;
        var k2 = ip ? ip.toLowerCase() : null;
        var k3 = name ? name.toLowerCase().replace(/\.lan$/i, '') : null;

        if (k1 && dhcp_comments[k1]) return dhcp_comments[k1];
        if (k2 && dhcp_comments[k2]) return dhcp_comments[k2];
        if (k3 && dhcp_comments[k3]) return dhcp_comments[k3];

        if (k3) {
            for (var i = 0; i < dhcp_list.length; i++) {
                var item = dhcp_list[i];
                if (item.comment) {
                    var baseCmt = item.comment.toLowerCase().replace(/\d+$/g, '');
                    var baseK3 = k3.replace(/\d+$/g, '');
                    if (baseCmt.length > 1 && (k3.startsWith(baseCmt) || baseK3.startsWith(baseCmt))) {
                        return item.comment;
                    }
                }
            }
        }
        return null;
    } catch(e) { return null; }
};

return view.extend({load:function(){return Promise.all([uci.load('dhcp'),uci.load('bandix'),uci.load('luci'),uci.load('argon').catch(function(){return null;})]);},render:function(data){function generateStyles(colorScheme){var scheme=colorScheme||'light';var themeColors=getThemeColors();var tooltipTextColor=scheme==='dark'?'#f9fafb':'#1f2937';var tooltipDividerColor=scheme==='dark'?'rgba(255, 255, 255, 0.2)':'currentColor';var tooltipDividerOpacity=1;var css=`
            .bandix-container {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            
            .bandix-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .bandix-title {
                font-size: 1.5rem;
                font-weight: 600;
                margin: 0;
            }
            
            .bandix-header-right {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .bandix-title-wrapper {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .bandix-version {
                font-size: 0.875rem;
                opacity: 0.5;
                font-weight: 400;
            }
            
            .bandix-version-wrapper {
                display: inline-flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            
            .bandix-version-item {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            
            .bandix-update-badge {
                display: inline-block;
                cursor: pointer;
                padding: 2px 8px;
                margin-left: 8px;
                background-color: rgba(239, 68, 68, 0.1);
                color: #ef4444;
                border-radius: 4px;
                font-size: 0.75rem;
                font-weight: 600;
                transition: all 0.2s ease;
            }
            
            .bandix-update-badge:hover {
                background-color: rgba(239, 68, 68, 0.2);
                transform: translateY(-1px);
            }
            
            
            /* 移动端隐藏版本信息和更新徽章 */
            @media (max-width: 768px) {
                .bandix-version-wrapper {
                    display: none;
                }
            }
            
            .device-mode-group {
                display: inline-flex;
                align-items: center;
                gap: 12px;
            }

            .device-toolbar {
                display: inline-flex;
                align-items: center;
                justify-content: flex-end;
                gap: 16px;
                flex-wrap: wrap;
            }

            .device-toolbar .device-group {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                padding-left: 12px;
                border-left: 1px solid rgba(107, 114, 128, 0.35);
            }

            .device-toolbar .device-group:first-child {
                padding-left: 0;
                border-left: none;
            }

            .device-toolbar .device-group-label {
                font-size: 0.75rem;
                opacity: 0.7;
                white-space: nowrap;
            }

            .device-toolbar .cbi-input-select {
                height: auto;
                font-size: 0.875rem;
            }

            .device-mode-group .device-mode-item {
                display: inline-flex;
                align-items: center;
                gap: 6px;
            }

            .device-mode-group .cbi-input-radio {
                margin: 0;
            }

            .device-mode-group .device-mode-item label {
                margin: 0;
            }
            
            .bandix-badge {
                border-radius: 4px;
                padding: 4px 10px;
                font-size: 0.875rem;
            }

            #history-retention {
                border: 1px solid rgba(107, 114, 128, 0.4);
            }
            
            .bandix-alert {
                border-radius: 4px;
                padding: 10px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                font-size: 0.875rem;
            }
            
            .bandix-alert.wide-theme {
                background-color: rgba(251, 191, 36, 0.1);
                border: 1px solid rgba(251, 191, 36, 0.3);
                color: #92400e;
            }
            
            .theme-dark .bandix-alert.wide-theme {
                background-color: rgba(251, 191, 36, 0.15);
                border-color: rgba(251, 191, 36, 0.4);
                color: #fbbf24;
            }
            
            .bandix-alert-icon {
                font-size: 0.875rem;
                font-weight: 700;
                width: 18px;
                height: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                flex-shrink: 0;
            }
            
            
            .bandix-table {
                width: 100%;
                table-layout: fixed;
            }
            
            .bandix-table th {
                padding: 10px 16px;
                text-align: left;
                font-weight: 600;
                border: none;
                font-size: 0.875rem;
                cursor: pointer;
                user-select: none;
                position: relative;
                transition: background-color 0.15s ease;
            }
            
            .bandix-table th:hover {
                opacity: 0.7;
            }
            
            .bandix-table th.sortable::after {
                content: '⇅';
                margin-left: 6px;
                opacity: 0.3;
                font-size: 0.75rem;
            }
            
            .bandix-table th.sortable.active::after {
                opacity: 1;
                color: #3b82f6;
            }
            
            .bandix-table th.sortable.asc::after {
                content: '↑';
            }
            
            .bandix-table th.sortable.desc::after {
                content: '↓';
            }
            
            .th-split-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            
            .th-split-section {
                display: flex;
                align-items: center;
                gap: 4px;
                cursor: pointer;
                padding: 2px 6px;
                border-radius: 4px;
                transition: background-color 0.2s ease;
            }
            
            .th-split-section:hover {
                opacity: 0.7;
            }
            
            .th-split-section.active {
                opacity: 0.7;
            }
            
            .th-split-icon {
                font-size: 0.7rem;
                opacity: 0.5;
            }
            
            .th-split-section.active .th-split-icon {
                opacity: 1;
                color: #3b82f6;
            }
            
            .th-split-divider {
                width: 1px;
                height: 16px;
                background-color: currentColor;
                opacity: 0.5;
            }
            
            .bandix-table td {
                padding: 12px 16px;
                border: none;
                vertical-align: middle;
                word-wrap: break-word;
                overflow-wrap: break-word;
            }
            
            .bandix-table th:nth-child(1),
            .bandix-table td:nth-child(1) {
                width: 27%;
            }
            
            .bandix-table th:nth-child(2),
            .bandix-table td:nth-child(2) {
                width: 22%;
            }
            
            .bandix-table th:nth-child(3),
            .bandix-table td:nth-child(3) {
                width: 22%;
            }
            
            .bandix-table th:nth-child(4),
            .bandix-table td:nth-child(4) {
                width: 12.5%;
            }
            
            .bandix-table th:nth-child(5),
            .bandix-table td:nth-child(5) {
                width: 16.5%;
            }
            
            .device-actions {
                display: flex;
                gap: 6px;
            }
            
            .device-actions .cbi-button {
                min-width: 32px;
                min-height: 32px;
                padding: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-sizing: border-box;
            }
            .schedule-rules-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

   /* 类型联动的高亮与弱化 */
            
            
            .device-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            
            .device-name {
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .device-connection-type {
                font-size: 0.75rem;
                opacity: 1.0;
                cursor: help;
                display: inline-flex;
                align-items: center;
                margin-right: 4px;
            }
            
            .device-connection-type img {
                opacity: 0.8;
            }
            
            .theme-dark .device-connection-type img {
                filter: invert(1);
            }
            
            .device-status {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }
            
            .device-status.online {
                background-color: #10b981;
            }
            
            .device-status.offline {
                background-color: #9ca3af;
            }
            
            .device-ip {
                opacity: 0.7;
                font-size: 0.875rem;
            }

            .device-uplink-badges {
                display: inline-flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: center;
                margin-left: 6px;
                vertical-align: middle;
            }

            .device-uplink-badge,
            .device-ch-badge {
                display: inline-block;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 0.7rem;
                font-weight: 600;
                line-height: 1.2;
            }

            .device-uplink-badge {
                background: rgba(107, 114, 128, 0.2);
                color: #4b5563;
            }

            .theme-dark .device-uplink-badge {
                background: rgba(156, 163, 175, 0.25);
                color: #9ca3af;
            }

            .device-ch-badge.device-ch-g24 {
                background: rgba(245, 158, 11, 0.2);
                color: #b45309;
            }

            .theme-dark .device-ch-badge.device-ch-g24 {
                background: rgba(251, 191, 36, 0.2);
                color: #fbbf24;
            }

            .device-ch-badge.device-ch-g5 {
                background: rgba(59, 130, 246, 0.2);
                color: #2563eb;
            }

            .theme-dark .device-ch-badge.device-ch-g5 {
                background: rgba(96, 165, 250, 0.2);
                color: #60a5fa;
            }

            .device-ch-badge.device-ch-g6 {
                background: rgba(139, 92, 246, 0.2);
                color: #6d28d9;
            }

            .theme-dark .device-ch-badge.device-ch-g6 {
                background: rgba(167, 139, 250, 0.2);
                color: #a78bfa;
            }

            .device-uplink-badges-wrap {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                align-items: center;
            }
            
            .device-ipv6 {
                opacity: 0.7;
                font-size: 0.75rem;
                font-family: monospace;
            }
            
            .device-mac {
                opacity: 0.6;
                font-size: 0.75rem;
            }

            .device-last-online {
                font-size: 0.75rem;
                color: #6b7280;
            }

            .device-last-online-value {
                color: #9ca3af;
            }

            .device-last-online-exact {
                display: none;
                color: #9ca3af;
            }

            /* 悬浮在整个设备信息区域时显示精确时间 */
            .device-info:hover .device-last-online-value {
                display: none;
            }

            .device-info:hover .device-last-online-exact {
                display: inline;
            }
            
            .traffic-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .traffic-row {
                display: flex;
                align-items: center;
                gap: 4px;
            }
            
            .traffic-icon {
                font-size: 0.75rem;
                font-weight: bold;
            }
            
            .traffic-icon.upload {
                color: ${BANDIX_COLOR_UPLOAD};
            }

            .traffic-icon.download {
                color: ${BANDIX_COLOR_DOWNLOAD};
            }
            
            .traffic-speed {
                font-weight: 600;
                font-size: 0.875rem;
            }
            
            .traffic-total {
                font-size: 0.75rem;
                opacity: 0.6;
                margin-left: 4px;
            }
            
            
            
            .error {
                text-align: center;
                padding: 40px;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                gap: 16px;
                margin-bottom: 0;
                margin-top: 0;
            }
            
            
            .bandix-container > .cbi-section:last-of-type {
                margin-bottom: 0;
            }
            
            .stats-card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }
            
            .stats-card-title {
                font-size: 0.875rem;
                font-weight: 600;
                opacity: 0.7;
                margin: 0 0 12px 0;
                text-transform: uppercase;
                letter-spacing: 0.025em;
            }
            
            .stats-grid .cbi-section {
                padding: 16px;
                border: 1px solid rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                transition: box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
                margin: 0 0 0 0 !important;
            }
            
            
            .stats-card-icon {
                font-size: 0.875rem;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 4px;
                background-color: currentColor;
                opacity: 0.1;
            }
            
            .stats-card-main-value {
                font-size: 2.25rem;
                font-weight: 700;
                margin: 0 0 8px 0;
                line-height: 1;
            }
            
            .stats-card-sub-value {
                font-size: 0.875rem;
                opacity: 0.7;
                margin: 0;
            }
            
            .stats-card-details {
                margin-top: 16px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .stats-detail-row {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.875rem;
            }
            
            .stats-detail-label {
                opacity: 0.7;
                font-weight: 500;
            }
            
            .stats-detail-value {
                font-weight: 600;
            }
            
            
            /* 模态框样式 */
            .bandix-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            #confirm-dialog-bandix-modal {
                z-index: 1105;
            }
            
            .bandix-modal-overlay.show {
                background-color: rgba(0, 0, 0, 0.5);
                opacity: 1;
                visibility: visible;
            }
            
            /* 通用 modal 尺寸设置 */
            .modal-content {
                max-width: 500px;
                width: 90%;
                max-height: 90vh;
                overflow-y: auto;
            }

            .bandix-modal {
                opacity: 0;
                transition: opacity 0.2s ease;
                background-color: ${themeColors.modalBg} !important;
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            }

            .bandix-modal-overlay.show .bandix-modal {
                opacity: 1;
            }

            .bandix-modal {
                background-color: ${themeColors.modalBg};
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
            }

            .bandix-modal-header {
                padding: 20px;
            }
            
            .bandix-modal-title {
                font-size: 1.25rem;
                font-weight: 600;
                margin: 0;
            }
            
            .bandix-modal-body {
                padding: 20px;
            }
            
            .bandix-modal-footer {
                padding: 16px 20px 20px 20px;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }

            /* 白名单弹窗样式 */
            .whitelist-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0, 0, 0, 0);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1002;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .whitelist-modal-overlay.show {
                background-color: rgba(0, 0, 0, 0.5);
                opacity: 1;
                visibility: visible;
            }

            .whitelist-modal {
                max-width: 560px;
                width: 92%;
                max-height: 90vh;
                overflow-y: auto;
                opacity: 0;
                transition: opacity 0.2s ease;
            }

            .whitelist-modal-overlay.show .whitelist-modal {
                opacity: 1;
            }


            .whitelist-modal-header {
                padding: 16px 20px 0 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }

            .whitelist-modal-title {
                font-size: 1.1rem;
                font-weight: 600;
                margin: 0;
            }

            .whitelist-modal-body {
                padding: 16px 20px;
            }

            .whitelist-modal-footer {
                padding: 0 20px 18px 20px;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }

            .whitelist-modal-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 12px;
            }

            .whitelist-modal-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 8px;
            }

            .whitelist-modal-item {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 10px;
                padding: 8px 10px;
                border-radius: 8px;
            }


            .whitelist-modal-mac {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
                font-size: 0.875rem;
            }

            .whitelist-modal-hint {
                font-size: 0.75rem;
                opacity: 0.7;
                margin-top: 6px;
            }

            .whitelist-modal-error {
                font-size: 0.8125rem;
                color: #ef4444;
                margin-top: 10px;
                display: none;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-label {
                display: block;
                font-weight: 600;
                margin-bottom: 8px;
                font-size: 0.875rem;
            }
            
            .form-input {
                width: 100%;
                border-radius: 4px;
                padding: 8px 12px;
                font-size: 0.875rem;
                transition: border-color 0.15s ease;
                box-sizing: border-box;
            }
            
            .form-input:focus {
                outline: none;
            }
        
            
            .schedule-time-row {
                display: flex;
                gap: 12px;
                align-items: center;
                margin-bottom: 16px;
            }
            
            .schedule-time-input {
                flex: 1;
                border-radius: 4px;
                padding: 8px 12px;
                font-size: 0.875rem;
                transition: border-color 0.15s ease;
                box-sizing: border-box;
            }
            
            .schedule-days {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 16px;
            }
            
            .schedule-day-btn {
                flex: 1;
                min-width: 40px;
                padding: 6px 8px;
                border-radius: 4px;
                border: 1px solid rgba(0, 0, 0, 0.2);
                background: transparent;
                cursor: pointer;
                font-size: 0.75rem;
                transition: all 0.15s ease;
                text-align: center;
            }
            
            
            .schedule-day-btn:hover {
                background-color: rgba(0, 0, 0, 0.05);
            }
            
            
            .schedule-day-btn.active {
                background-color: #3b82f6;
                color: white;
                border-color: #3b82f6;
            }
            
            .schedule-rules-list {
                min-height: 200px;
                max-height: 400px;
                overflow-y: auto;
                border-radius: 4px;
                padding: 16px;
            }
            
            
            .schedule-rules-empty {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 200px;
                text-align: center;
                font-size: 0.875rem;
            }
            
            
            .schedule-rule-item {
                padding: 12px;
                border: 1px solid;
                border-radius: 4px;
                margin-bottom: 8px;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            
            .schedule-rule-info {
                flex: 1;
            }
            
            .schedule-rule-time {
                font-weight: 600;
                margin-bottom: 4px;
            }
            
            .schedule-rule-days {
                font-size: 0.75rem;
                opacity: 0.7;
                margin-bottom: 4px;
            }
            
            .schedule-rule-limits {
                font-size: 0.75rem;
                opacity: 0.7;
            }
            
            .schedule-rule-delete {
                padding: 6px 12px;
                font-size: 0.75rem;
                cursor: pointer;
                border-radius: 4px;
                border: 1px solid rgba(239, 68, 68, 0.3);
                background-color: rgba(239, 68, 68, 0.1);
                color: #ef4444;
                transition: all 0.15s ease;
            }
            
            .schedule-rule-delete:hover {
                background-color: rgba(239, 68, 68, 0.2);
            }
            
            .schedule-rule-actions {
                display: flex;
                gap: 8px;
                flex-shrink: 0;
            }
            
            .schedule-rule-edit {
                padding: 6px 12px;
                font-size: 0.75rem;
                cursor: pointer;
                border-radius: 4px;
                border: 1px solid rgba(59, 130, 246, 0.3);
                background-color: rgba(59, 130, 246, 0.1);
                color: #3b82f6;
                transition: all 0.15s ease;
            }
            
            .schedule-rule-edit:hover {
                background-color: rgba(59, 130, 246, 0.2);
            }
            
            .device-summary {
                border-radius: 4px;
                padding: 12px;
                margin-bottom: 16px;
            }
            
            .device-summary-name {
                font-weight: 600;
                margin-bottom: 4px;
            }
            
            .device-summary-details {
                opacity: 0.7;
                font-size: 0.875rem;
            }

            .device-summary-badges {
                margin-top: 8px;
            }

            /* 加载动画 */
            .loading-spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid transparent;
                border-radius: 50%;
                border-top-color: #3b82f6;
                animation: spin 1s ease-in-out infinite;
                margin-right: 8px;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            .btn-loading {
                opacity: 0.7;
                pointer-events: none;
            }

            /* 确认对话框 */
            .confirm-dialog {
                max-width: 400px;
            }
            
            .confirm-dialog .bandix-modal-body {
                padding: 24px;
            }
            
            .confirm-dialog-title {
                font-size: 1.125rem;
                font-weight: 600;
                margin-bottom: 12px;
            }
            
            .confirm-dialog-message {
                font-size: 0.875rem;
                line-height: 1.5;
                margin-bottom: 20px;
            }
            
            
            .confirm-dialog-footer {
                display: flex;
                gap: 10px;
                justify-content: flex-end;
            }

            /* 历史趋势 */
            .history-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
            }
            @media (max-width: 768px) {
                .history-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 12px;
                }
            }
            .history-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
                padding: 12px 16px;
            }
            .history-controls .cbi-input-select {
                width: auto;
                min-width: 160px;
            }
            .history-card-body {
                padding: 16px;
                position: relative;
            }
            .history-legend {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                padding-right: 16px;
            }
            .legend-item { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; }
            .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
            .legend-up { background-color: ${BANDIX_COLOR_UPLOAD}; }
            .legend-down { background-color: ${BANDIX_COLOR_DOWNLOAD}; }
            #history-canvas { width: 100%; height: 200px; display: block; } /* 变窄的高度 */
            
            /* 移动端优化 */
            @media (max-width: 768px) {
                .bandix-alert {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 8px;
                }
                
                .bandix-alert > div:first-child {
                    width: 100%;
                }
                
                .bandix-alert #device-count {
                    width: 100%;
                    text-align: left;
                }
                
                .stats-card-info-icon {
                    display: none;
                }
                
                #history-canvas { 
                    height: 300px; /* 移动端增加高度 */
                }
                .history-controls {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 8px;
                    padding: 12px;
                }
                .history-controls .cbi-input-select {
                    width: 100%;
                    min-width: 0;
                }
                .history-controls .form-label {
                    margin-bottom: 4px;
                }
                .history-legend {
                    margin-left: 0;
                    margin-top: 8px;
                    width: 100%;
                    justify-content: center;
                    padding-right: 0;
                }
                .history-header {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 8px;
                }
                .history-card-body {
                    padding: 12px;
                }
                .device-card {
                    margin-left: 12px;
                    margin-right: 12px;
                }
                .history-tooltip {
                    width: calc(100vw - 32px);
                    max-width: 320px;
                    font-size: 0.75rem;
                    padding: 10px;
                }
                .history-tooltip .ht-kpis {
                    grid-template-columns: 1fr;
                    gap: 8px;
                }
                .history-tooltip .ht-kpi .ht-k-value {
                    font-size: 0.875rem;
                }
                #history-retention {
                    display: none !important;
                }
                #history-time-range {
                    display: none !important;
                }
                
                /* 移动端隐藏设备模式切换按钮 */
                .device-mode-group {
                    display: none !important;
                }
                
                /* 移动端设备列表卡片式布局 */
                .bandix-table {
                    display: none; /* 移动端隐藏表格 */
                }
                
                .device-list-cards {
                    display: block;
                }
                
                .device-card {
                    border: 1px solid rgba(0, 0, 0, 0.1);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 12px;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                }
                
                
                .device-card-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    padding-bottom: 12px;
                    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
                }
                
                
                .device-card-name {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .device-card-name .device-status {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    display: inline-block;
                    flex-shrink: 0;
                }
                
                .device-card-name .device-status.online {
                    background-color: #10b981;
                }
                
                .device-card-name .device-status.offline {
                    background-color: #9ca3af;
                }
                
                .device-card-ip {
                    font-size: 0.75rem;
                    opacity: 0.7;
                    margin-top: 4px;
                }

                .device-card-ip .device-uplink-badges .device-uplink-badge,
                .device-card-ip .device-uplink-badges .device-ch-badge {
                    padding: 1px 5px;
                    font-size: 0.65rem;
                }
                
                .device-card-action {
                    flex-shrink: 0;
                    display: flex;
                    gap: 6px;
                }
                
                .device-card-action .cbi-button {
                    min-width: 32px;
                    min-height: 32px;
                    padding: 6px;
                    font-size: 0.875rem;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    box-sizing: border-box;
                }
                
                .device-card-content {
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 12px;
                }
                
                .device-card-section {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                
                .device-card-section-label {
                    font-size: 0.75rem;
                    opacity: 0.7;
                    font-weight: 500;
                    margin-bottom: 4px;
                }
                
                .device-card-traffic {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                
                .device-card-traffic-row {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.875rem;
                }
                
                /* LAN流量样式（移动端直接显示） */
                .device-card-lan {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(0, 0, 0, 0.1);
                }
                
                
                /* 规则显示样式 */
                .device-card-rules {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(0, 0, 0, 0.1);
                }
                
                
                .device-card-rules-content {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    padding: 8px 0;
                }
                
                .device-card-rules-empty {
                    font-size: 0.75rem;
                    opacity: 0.6;
                    padding: 4px 0;
                }
                
                .device-card-rules-count {
                    font-size: 0.8125rem;
                    font-weight: 600;
                    color: inherit;
                    margin-bottom: 2px;
                }
                
                .device-card-rules-active-time {
                    font-size: 0.8125rem;
                    color: #10b981;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 8px;
                    line-height: 1.4;
                }
                
                .device-card-rules-limits {
                    font-size: 0.75rem;
                    opacity: 0.8;
                    margin-top: 2px;
                    word-break: break-word;
                }
                
                .device-card-rules-more {
                    font-size: 0.7rem;
                    opacity: 0.6;
                    margin-top: 2px;
                }
                
                .device-card-rules-inactive {
                    font-size: 0.8125rem;
                    opacity: 0.5;
                    margin-top: 4px;
                }
            }
            
            /* PC端显示表格，隐藏卡片 */
            @media (min-width: 769px) {
                .bandix-table {
                    display: table;
                }
                
                .device-list-cards {
                    display: none;
                }
            }
   .history-tooltip {
    position: fixed;
                display: none;
    width: 320px;
    box-sizing: border-box;
                padding: 12px;
                z-index: 10;
                pointer-events: none;
                font-size: 0.8125rem;
                line-height: 1.5;
                white-space: nowrap;
                background-color: ${themeColors.tooltipBg} !important;
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                color: ${tooltipTextColor} !important;
            }
            
            .history-tooltip .ht-title { font-weight: 700; margin-bottom: 6px; }
            .history-tooltip .ht-row { display: flex; justify-content: space-between; gap: 12px; }
            .history-tooltip .ht-key { opacity: 0.7; }
            .history-tooltip .ht-val { }
   .history-tooltip .ht-device { margin-top: 4px; margin-bottom: 6px; opacity: 0.7; font-size: 0.75rem; }
   /* 强调关键信息的排版 */
   .history-tooltip .ht-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 2px; margin-bottom: 6px; }
   .history-tooltip .ht-kpi .ht-k-label { opacity: 0.7; font-size: 0.75rem; }
   .history-tooltip .ht-kpi .ht-k-value { font-size: 1rem; font-weight: 700; }
   .history-tooltip .ht-kpi.down .ht-k-value { color: ${BANDIX_COLOR_DOWNLOAD}; }
   .history-tooltip .ht-kpi.up .ht-k-value { color: ${BANDIX_COLOR_UPLOAD}; }
   .history-tooltip .ht-divider { height: 1px; background-color: ${tooltipDividerColor}; opacity: ${tooltipDividerOpacity}; margin: 8px 0; }
   .history-tooltip .ht-section-title { font-weight: 600; font-size: 0.75rem; opacity: 0.7; margin: 4px 0 6px 0; }

   /* Traffic Timeline Tooltip - 使用与 History Tooltip 相同的样式 */
   .traffic-increments-tooltip .ht-kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 2px; margin-bottom: 6px; }
   .traffic-increments-tooltip .ht-kpi .ht-k-label { opacity: 0.7; font-size: 0.75rem; }
   .traffic-increments-tooltip .ht-kpi .ht-k-value { font-size: 1rem; font-weight: 700; }
   .traffic-increments-tooltip .ht-kpi.down .ht-k-value { color: ${BANDIX_COLOR_DOWNLOAD}; }
   .traffic-increments-tooltip .ht-kpi.up .ht-k-value { color: ${BANDIX_COLOR_UPLOAD}; }
   .traffic-increments-tooltip .ht-divider { height: 1px; background-color: ${tooltipDividerColor}; opacity: ${tooltipDividerOpacity}; margin: 8px 0; }
   .traffic-increments-tooltip .ht-section-title { font-weight: 600; font-size: 0.75rem; opacity: 0.7; margin: 4px 0 6px 0; }
   .traffic-increments-tooltip .ht-row { display: flex; justify-content: space-between; gap: 12px; }
   .traffic-increments-tooltip .ht-key { opacity: 0.7; }
   .traffic-increments-tooltip .ht-val { }
   
   /* Schedule Rules Tooltip */
   .schedule-rules-tooltip {
    position: fixed;
    display: none;
    width: 360px;
    max-width: 90vw;
    box-sizing: border-box;
    padding: 12px;
    z-index: 10000;
    pointer-events: none;
    font-size: 0.8125rem;
    line-height: 1.5;
    background-color: ${themeColors.tooltipBg} !important;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    color: ${tooltipTextColor} !important;
   }
   
   
   .schedule-rules-tooltip .srt-title {
    font-weight: 700;
    margin-bottom: 8px;
    font-size: 0.875rem;
   }
   
   .schedule-rules-tooltip .srt-rule-item {
    padding: 8px 0;
    border-bottom: 1px solid ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
   }
   
   
   .schedule-rules-tooltip .srt-rule-item:last-child {
    border-bottom: none;
   }
   
   .schedule-rules-tooltip .srt-rule-time {
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 0.75rem;
   }
   
   .schedule-rules-tooltip .srt-rule-days {
    font-size: 0.75rem;
    font-weight: 500;
    opacity: 0.7;
    margin-bottom: 4px;
   }
   
   .schedule-rules-tooltip .srt-rule-limits {
    font-size: 0.875rem;
    font-weight: 600;
    opacity: 0.8;
   }
   
   .schedule-rules-tooltip .srt-rule-limits .srt-arrow {
    font-size: 0.75rem;
    font-weight: bold;
   }
   
   .schedule-rules-info {
   }
   
   /* 统计区域样式 */
   .traffic-stats-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin-top: 16px;
   }
   
   .traffic-stats-section {
    padding: 16px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
   }
   
   
   .traffic-stats-section h4 {
    margin: 0 0 16px 0;
    font-size: 1rem;
    font-weight: 600;
   }
   
   .usage-ranking-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
   }
   
   .usage-ranking-title {
    font-size: 1rem;
    font-weight: 600;
   }
   
   .usage-ranking-timerange {
    font-size: 0.8125rem;
    opacity: 0.6;
    font-weight: 400;
   }
   
   .usage-ranking-query {
    margin-bottom: 16px;
    padding: 16px;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 8px;
   }
   
   
   .usage-ranking-date-range-row {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
   }
   
   .usage-ranking-date-picker-wrapper {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-width: 160px;
   }

   .usage-ranking-network-type-wrapper {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 0 0 auto;
    min-width: 140px;
   }

   .usage-ranking-network-label {
    font-size: 0.8125rem;
    font-weight: 500;
    opacity: 0.7;
    color: inherit;
   }


   .usage-ranking-date-label {
    font-size: 0.8125rem;
    font-weight: 500;
    opacity: 0.7;
    color: inherit;
   }
   
   .usage-ranking-query-presets {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
   }
   
   
   .usage-ranking-custom-range {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
   }
   
   .usage-ranking-date-picker {
    position: relative;
   }
   
   
   .usage-ranking-date-separator {
    font-size: 1.25rem;
    opacity: 0.4;
    margin-bottom: 28px;
    font-weight: 300;
   }
   
   .usage-ranking-query-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
   }

   /* 查询按钮 loading 状态样式（避免与 LuCI/主题的 .loading 冲突） */
   .usage-ranking-query-btn.bandix-loading {
    position: relative;
    opacity: 0.7;
   }

   .usage-ranking-query-btn.bandix-loading::after {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    top: 50%;
    left: 50%;
    margin-left: -7px;
    margin-top: -7px;
    border: 2px solid rgba(59, 130, 246, 0.3);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
   }

   .usage-ranking-query-btn.bandix-loading span {
    opacity: 0;
   }

   
   
   .usage-ranking-query-reset {
    padding: 8px 12px;
    background-color: transparent;
    color: #6b7280;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s ease;
   }
   
   .usage-ranking-query-reset:hover {
    background-color: rgba(0, 0, 0, 0.05);
    border-color: rgba(0, 0, 0, 0.25);
   }
   
   
   .usage-ranking-timeline {
    margin-top: 12px;
    height: 4px;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 2px;
    position: relative;
   }
   
   
   .usage-ranking-timeline-range {
    position: absolute;
    height: 100%;
    background-color: #3b82f6;
    border-radius: 2px;
    transition: all 0.3s ease;
   }
   
   .usage-ranking-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding-right: 4px;
   }
   
   /* 滚动条样式 */
   .usage-ranking-list::-webkit-scrollbar {
    width: 6px;
   }
   
   .usage-ranking-list::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.05);
    border-radius: 3px;
   }
   
   .usage-ranking-list::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
   }
   
   .usage-ranking-list::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.3);
   }
   
   
   .usage-ranking-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding: 12px;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 6px;
    font-size: 0.875rem;
   }
   
   
   .usage-ranking-info-text {
    opacity: 0.6;
   }
   
   .usage-ranking-toggle-btn {
    padding: 6px 12px;
    background-color: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s ease;
   }
   
   .usage-ranking-toggle-btn:hover {
    background-color: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.3);
   }
   
   
   .usage-ranking-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: 8px;
    background-color: rgba(0, 0, 0, 0.02);
    border: 1px solid rgba(0, 0, 0, 0.06);
    overflow: hidden;
   }
   
   
   .usage-ranking-item:hover {
    background-color: rgba(0, 0, 0, 0.04);
    border-color: rgba(0, 0, 0, 0.1);
   }
   
   
   /* 背景进度条 */
   .usage-ranking-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--progress-width, 0%);
    background: linear-gradient(90deg, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0.10) 100%);
    z-index: 0;
   }
   
   
   .usage-ranking-item > * {
    position: relative;
    z-index: 1;
   }
   
   .usage-ranking-rank {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    font-weight: 700;
    font-size: 0.75rem;
    border-radius: 6px;
    background-color: rgba(59, 130, 246, 0.1);
    color: #3b82f6;
    flex-shrink: 0;
   }
   
   
   .usage-ranking-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
   }
   
   .usage-ranking-device {
    flex: 1;
    min-width: 0;
   }
   
   .usage-ranking-name {
    font-weight: 600;
    font-size: 0.875rem;
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
   }
   
   .usage-ranking-meta {
    display: flex;
    gap: 8px;
    font-size: 0.75rem;
    opacity: 0.5;
    font-family: monospace;
   }
   
   .usage-ranking-meta > span {
    flex-shrink: 0;
    white-space: nowrap;
   }
   
   .usage-ranking-stats {
    display: flex;
    align-items: center;
    gap: 16px;
   }
   
   .usage-ranking-traffic {
    display: flex;
    align-items: center;
    gap: 10px;
   }
   
   .usage-ranking-traffic-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.875rem;
    font-weight: 500;
   }
   
   .usage-ranking-traffic-item.rx {
    color: ${BANDIX_COLOR_DOWNLOAD};
   }
   
   .usage-ranking-traffic-item.tx {
    color: ${BANDIX_COLOR_UPLOAD};
   }
   
   .usage-ranking-traffic-item.total {
    color: #6b7280;
    font-weight: 600;
   }
   
   
   .usage-ranking-traffic-arrow {
    font-weight: 700;
    font-size: 1rem;
   }
   
   .usage-ranking-percentage {
    font-size: 1.25rem;
    font-weight: 700;
    color: #3b82f6;
    min-width: 70px;
    text-align: right;
   }
   
   
   .traffic-increments-filters {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
   }
   
   .traffic-increments-filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
   }
   
   .traffic-increments-filter-label {
    font-size: 0.8125rem;
    opacity: 0.7;
    white-space: nowrap;
   }
   
   .traffic-increments-filters .cbi-input-select {
    min-width: 120px;
   }
   
   .traffic-increments-query {
    margin-bottom: 16px;
    padding: 16px;
    background-color: rgba(0, 0, 0, 0.02);
    border-radius: 8px;
   }
   
   
   
   .traffic-increments-chart {
    position: relative;
    width: 100%;
    height: 300px;
    cursor: pointer;
   }
   
   .traffic-increments-tooltip {
    position: fixed;
    background-color: ${themeColors.tooltipBg} !important;
    color: ${tooltipTextColor} !important;
    padding: 12px;
    border-radius: 6px;
    font-size: 0.8125rem;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: none;
    min-width: 280px;
    max-width: 400px;
   }


   .traffic-increments-tooltip-title {
    font-weight: 600;
    margin-bottom: 8px;
    border-bottom: 1px solid ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
    padding-bottom: 4px;
    font-size: 0.875rem;
   }


   .traffic-increments-tooltip-section {
    margin-bottom: 8px;
   }

   .traffic-increments-tooltip-section:last-child {
    margin-bottom: 0;
   }

   .traffic-increments-tooltip-section-title {
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
    color: ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.7)'};
    border-bottom: 1px solid ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
    padding-bottom: 2px;
   }


   .traffic-increments-tooltip-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 2px;
    font-size: 0.75rem;
   }

   .traffic-increments-tooltip-item:last-child {
    margin-bottom: 0;
   }

   .traffic-increments-tooltip-item-label {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
   }

   .traffic-increments-tooltip-item-value {
    font-weight: 500;
    text-align: right;
   }

   .traffic-increments-tooltip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
   }

   .traffic-increments-tooltip-dot.rx {
    background-color: ${BANDIX_COLOR_DOWNLOAD};
   }

   .traffic-increments-tooltip-dot.tx {
    background-color: ${BANDIX_COLOR_UPLOAD};
   }

   .traffic-increments-tooltip-dot.wan {
    background-color: #8b5cf6;
   }

   .traffic-increments-tooltip-dot.lan {
    background-color: #10b981;
   }
   
   .stats-card-info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'};
    color: ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)'};
    font-size: 0.75rem;
    font-weight: 600;
    cursor: help;
    margin-left: 6px;
    vertical-align: middle;
    line-height: 1;
    transition: background-color 0.2s ease, color 0.2s ease;
   }
   
   .stats-card-info-icon:hover {
    background-color: ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.15)'};
    color: ${scheme === 'dark' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)'};
   }
   
   .lan-traffic-tooltip {
    position: absolute;
    background-color: ${themeColors.tooltipBg} !important;
    color: ${tooltipTextColor} !important;
    padding: 12px;
    border-radius: 6px;
    font-size: 0.8125rem;
    pointer-events: none;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: none;
    min-width: 280px;
    max-width: 400px;
    line-height: 1.5;
   }
   
   .traffic-increments-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-top: 16px;
   }
   
   .traffic-increments-summary-item {
    text-align: center;
    padding: 12px;
    border-radius: 6px;
    background-color: rgba(0, 0, 0, 0.02);
   }
   
   
   .traffic-increments-summary-label {
    font-size: 0.75rem;
    opacity: 0.7;
    margin-bottom: 4px;
   }
   
   .traffic-increments-summary-value {
    font-weight: 600;
    font-size: 0.875rem;
   }
   
   /* 统计区域头部和控制 */
   .traffic-stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
   }
   
   /* 图例 */
   .traffic-stats-legend {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 12px;
    padding: 8px;
   }
   
   .traffic-stats-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
   }
   
   .traffic-stats-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
   }
   
   .traffic-stats-legend-dot.rx {
    background-color: ${BANDIX_COLOR_DOWNLOAD};
   }
   
   .traffic-stats-legend-dot.tx {
    background-color: ${BANDIX_COLOR_UPLOAD};
   }
   
   /* 移动端响应式样式 */
   @media (max-width: 768px) {
    /* Traffic Statistics 容器 */
    .traffic-stats-container {
     gap: 16px;
    }
    
    .traffic-stats-section {
     padding: 12px;
    }
    
    /* Header 布局 - 垂直排列 */
    .usage-ranking-header {
     flex-direction: column;
     align-items: flex-start;
     gap: 8px;
    }
    
    .usage-ranking-title {
     font-size: 0.9375rem;
    }
    
    .usage-ranking-timerange {
     font-size: 0.75rem;
     width: 100%;
    }
    
    /* 查询区域 */
    .usage-ranking-query {
     padding: 12px;
     margin-bottom: 12px;
    }
    
    /* 日期选择器区域 */
    .usage-ranking-date-range-row {
     flex-direction: column;
     gap: 12px;
     margin-bottom: 12px;
    }
    
    .usage-ranking-date-picker-wrapper {
     min-width: 100%;
    }
    
    .usage-ranking-date-label {
     font-size: 0.75rem;
    }
    
    .usage-ranking-date-separator {
     display: none;
    }

    /* 快捷按钮 */
    .usage-ranking-query-presets {
     gap: 6px;
     margin-bottom: 10px;
    }

    /* 查询操作按钮 */
    .usage-ranking-query-actions {
     width: 100%;
     margin-left: 0;
     justify-content: stretch;
    }
    
    /* 设备列表项 - 垂直布局 */
    .usage-ranking-item {
     flex-direction: column;
     align-items: flex-start;
     gap: 10px;
     padding: 10px;
    }
    
    .usage-ranking-rank {
     min-width: 24px;
     height: 24px;
     font-size: 0.75rem;
    }
    
    .usage-ranking-info {
     flex-direction: column;
     align-items: flex-start;
     gap: 8px;
     width: 100%;
    }
    
    .usage-ranking-device {
     width: 100%;
    }
    
    .usage-ranking-name {
     font-size: 0.875rem;
     margin-bottom: 2px;
    }
    
    .usage-ranking-meta {
     font-size: 0.6875rem;
     gap: 8px;
     flex-wrap: nowrap;
     display: flex;
     align-items: center;
     width: 100%;
     justify-content: space-between;
    }
    
    .usage-ranking-meta > span:first-child {
     flex: 0 1 auto;
     min-width: 0;
     overflow: hidden;
     text-overflow: ellipsis;
     white-space: nowrap;
    }
    
    .usage-ranking-meta > span:nth-child(2) {
     display: none;
    }
    
    .usage-ranking-meta > .usage-ranking-meta-total {
     font-size: 0.8125rem;
     font-weight: 600;
     color: #6b7280;
     margin-left: 8px;
     flex-shrink: 0;
    }
    
    
    .usage-ranking-stats {
     flex-direction: column;
     align-items: flex-start;
     gap: 8px;
     width: 100%;
    }
    
    .usage-ranking-traffic {
     flex-wrap: wrap;
     gap: 8px;
     width: 100%;
    }
    
    /* 隐藏移动端下的总量显示（因为已经在 meta 中显示） */
    .usage-ranking-traffic-item.total {
     display: none;
    }
    
    .usage-ranking-traffic-item {
     font-size: 0.8125rem;
    }
    
    .usage-ranking-traffic-arrow {
     font-size: 0.875rem;
    }
    
    .usage-ranking-percentage {
     font-size: 1.25rem;
     min-width: auto;
     text-align: left;
     width: 100%;
    }
    
    /* 控制按钮 */
    .usage-ranking-controls {
     flex-direction: column;
     gap: 8px;
     align-items: stretch;
    }
    
    .usage-ranking-info-text {
     font-size: 0.75rem;
     text-align: center;
    }
    
    .usage-ranking-toggle-btn {
     width: 100%;
     padding: 8px 12px;
     font-size: 0.8125rem;
    }
    
    /* Traffic Timeline 筛选器 */
    .traffic-increments-filters {
     flex-direction: column;
     align-items: stretch;
     gap: 10px;
     margin-bottom: 12px;
    }
    
    .traffic-increments-filter-group {
     flex-direction: column;
     align-items: stretch;
     gap: 6px;
    }
    
    .traffic-increments-filter-label {
     font-size: 0.75rem;
    }
    
    .traffic-increments-filters .cbi-input-select {
     width: 100%;
     min-width: auto;
     padding: 8px 10px;
     font-size: 0.8125rem;
    }
    
    /* Traffic Timeline 查询区域 */
    .traffic-increments-query {
     padding: 12px;
     margin-bottom: 12px;
    }
    
    /* Traffic Timeline 的日期选择器使用相同的 usage-ranking-* 类名，已在上面覆盖 */
    
    /* 图表 */
    .traffic-increments-chart {
     height: 250px;
    }
    
    /* 摘要卡片 */
    .traffic-increments-summary {
     grid-template-columns: 1fr;
     gap: 8px;
     margin-top: 12px;
    }
    
    .traffic-increments-summary-item {
     padding: 10px;
    }
    
    .traffic-increments-summary-label {
     font-size: 0.6875rem;
    }
    
    .traffic-increments-summary-value {
     font-size: 0.8125rem;
    }
    
    /* 图例 - 移动端隐藏 */
    .traffic-stats-legend {
     display: none;
    }
   }

        `;return css;}
var initialScheme=getThemeMode();var oldStyle=document.getElementById('bandix-styles');if(oldStyle&&oldStyle.parentNode)oldStyle.parentNode.removeChild(oldStyle);var style=E('style',{'id':'bandix-styles'},generateStyles(initialScheme));document.head.appendChild(style);function updateThemeStyles(){var newScheme=getThemeMode();var oldStyle=document.getElementById('bandix-styles');if(oldStyle){oldStyle.textContent=generateStyles(newScheme);}}
if(window.matchMedia){var colorSchemeMedia=window.matchMedia('(prefers-color-scheme: dark)');colorSchemeMedia.addEventListener('change',function(e){updateThemeStyles();});}
var lastThemeMode=getThemeMode();setInterval(function(){try{var currentThemeMode=getThemeMode();if(currentThemeMode!==lastThemeMode){lastThemeMode=currentThemeMode;updateThemeStyles();}}catch(e){}},5000);var themeMode=getThemeMode();var view=E('div',{'class':'bandix-container theme-'+themeMode},[E('div',{'class':'bandix-header'},[E('div',{'class':'bandix-title-wrapper'},[E('h1',{'class':'bandix-title'},_('Bandix Traffic Monitor')),E('div',{'class':'bandix-version-wrapper'},[E('div',{'class':'bandix-version-item'},[E('span',{'class':'bandix-version','id':'bandix-luci-version'},''),]),E('div',{'class':'bandix-version-item'},[E('span',{'class':'bandix-version','id':'bandix-core-version'},''),]),E('span',{'class':'bandix-update-badge','id':'bandix-update-badge','style':'display: none;'},_('Update available'))])])]),E('div',{'class':'bandix-alert'+(getThemeType()==='wide'?' wide-theme':'')},[E('div',{'style':'display: flex; align-items: center; gap: 8px;'},[E('span',{'style':'font-size: 1rem;'},'⚠'),E('span',{},_("Rate limiting only applies to WAN traffic."))]),E('div',{'class':'bandix-badge','id':'device-count'},_('Online Devices')+': 0 / 0')]),E('div',{'class':'stats-grid','id':'stats-grid'}),E('div',{'class':'cbi-section','id':'history-card'},[E('h3',{'style':'display: flex; align-items: center; justify-content: space-between;'},[E('span',{},_('Realtime Traffic Trends')),E('div',{'class':'history-legend'},[E('div',{'class':'legend-item'},[E('span',{'class':'legend-dot legend-up'}),_('Upload Rate')]),E('div',{'class':'legend-item'},[E('span',{'class':'legend-dot legend-down'}),_('Download Rate')])])]),E('div',{'class':'history-controls'},[E('label',{'class':'form-label','style':'margin: 0;'},_('Select Device')),E('select',{'class':'cbi-input-select','id':'history-device-select'},[E('option',{'value':''},_('All Devices'))]),E('label',{'class':'form-label','style':'margin: 0;'},_('Type')),E('select',{'class':'cbi-input-select','id':'history-type-select'},[E('option',{'value':'total'},_('Total')),E('option',{'value':'lan'},_('LAN Traffic')),E('option',{'value':'wan'},_('WAN Traffic'))]),E('span',{'class':'bandix-badge','id':'history-zoom-level','style':'margin-left: 16px; display: none;'},''),E('span',{'class':'bandix-badge','id':'history-time-range','style':'margin-left: 16px; display: none;'},''),E('span',{'class':'bandix-badge','id':'history-retention','style':'margin-left: auto;'},'')]),E('div',{'class':'history-card-body'},[E('canvas',{'id':'history-canvas','height':'240'}),E('div',{'class':'history-tooltip','id':'history-tooltip'})])]),E('div',{'class':'cbi-section'},[E('h3',{'class':'history-header','style':'display: flex; align-items: center; justify-content: space-between;'},[E('span',{},_('Device List')),E('div',{'class':'device-toolbar'},[E('div',{'class':'device-group'},[E('span',{'class':'device-group-label'},_('Period')),E('select',{'class':'cbi-input-select','id':'bandix_device_period_select'},[E('option',{'value':'all','selected':((localStorage.getItem('bandix_device_period')||'all')==='all')?'selected':null},_('All')),E('option',{'value':'today','selected':((localStorage.getItem('bandix_device_period')||'all')==='today')?'selected':null},_('Today')),E('option',{'value':'week','selected':((localStorage.getItem('bandix_device_period')||'all')==='week')?'selected':null},_('This Week')),E('option',{'value':'month','selected':((localStorage.getItem('bandix_device_period')||'all')==='month')?'selected':null},_('This Month')),E('option',{'value':'year','selected':((localStorage.getItem('bandix_device_period')||'all')==='year')?'selected':null},_('This Year'))])]),E('div',{'class':'device-group'},[E('span',{'class':'device-group-label'},_('Display Mode')),E('select',{'class':'cbi-input-select','id':'bandix_device_mode_select'},[E('option',{'value':'simple','selected':(localStorage.getItem('bandix_device_mode')!=='detailed')?'selected':null},_('Simple Mode')),E('option',{'value':'detailed','selected':(localStorage.getItem('bandix_device_mode')==='detailed')?'selected':null},_('Detailed Mode'))])]),E('div',{'class':'device-group'},[E('span',{'class':'device-group-label'},_('Global Rate Limit')),E('span',{'class':'cbi-button cbi-button-action','id':'bandix_whitelist_badge','style':'cursor: pointer; user-select: none;'},_('Loading...'))])])]),E('div',{'id':'traffic-status'},[E('table',{'class':'bandix-table'},[E('thead',{},[E('tr',{},[E('th',{},_('Device Info')),E('th',{},_('LAN Traffic')),E('th',{},_('WAN Traffic')),E('th',{},_('Rate Limit')),E('th',{},_('Actions'))])]),E('tbody',{})])])]),E('div',{'class':'cbi-section'},[E('h3',{'class':'traffic-stats-header'},[E('span',{},_('Traffic Statistics'))]),E('div',{'id':'traffic-statistics'},[E('div',{'class':'traffic-stats-container'},[E('div',{'class':'traffic-stats-section'},[E('div',{'class':'usage-ranking-header'},[E('h4',{'class':'usage-ranking-title'},[E('span',{},_('Device Usage Ranking'))]),E('span',{'class':'usage-ranking-timerange','id':'usage-ranking-timerange'},'')]),E('div',{'class':'usage-ranking-query'},[E('div',{'class':'usage-ranking-date-range-row'},[E('div',{'class':'usage-ranking-date-picker-wrapper'},[E('label',{'class':'usage-ranking-date-label'},_('Start Date')),E('div',{'class':'usage-ranking-date-picker','id':'usage-ranking-start-picker'},[E('input',{'type':'date','id':'usage-ranking-start-date','class':'cbi-input-date'})])]),E('span',{'class':'usage-ranking-date-separator'},'→'),E('div',{'class':'usage-ranking-date-picker-wrapper'},[E('label',{'class':'usage-ranking-date-label'},_('End Date')),E('div',{'class':'usage-ranking-date-picker','id':'usage-ranking-end-picker'},[E('input',{'type':'date','id':'usage-ranking-end-date','class':'cbi-input-date'})])]),E('div',{'class':'usage-ranking-network-type-wrapper'},[E('label',{'class':'usage-ranking-network-label'},_('Network Type')),E('select',{'class':'cbi-input-select','id':'usage-ranking-network-type'},[E('option',{'value':'wan'},_('WAN Traffic')),E('option',{'value':'lan'},_('LAN Traffic')),E('option',{'value':'all'},_('Total'))])]),E('div',{'class':'usage-ranking-query-actions'},[E('button',{'class':'cbi-button cbi-button-action usage-ranking-query-btn','id':'usage-ranking-query-btn'},E('span',{},_('Query'))),E('button',{'class':'cbi-button cbi-button-reset','id':'usage-ranking-reset-btn'},_('Reset'))])]),E('div',{'class':'usage-ranking-query-presets'},[E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'today'},_('Today')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'thisweek'},_('This Week')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'lastweek'},_('Last Week')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'thismonth'},_('This Month')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'lastmonth'},_('Last Month')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'7days'},_('Last 7 Days')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'30days'},_('Last 30 Days')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'90days'},_('Last 90 Days')),E('button',{'class':'cbi-button cbi-button-positive','data-preset':'1year'},_('Last Year'))]),E('div',{'class':'usage-ranking-timeline','id':'usage-ranking-timeline'},[E('div',{'class':'usage-ranking-timeline-range','id':'usage-ranking-timeline-range'})])]),E('div',{'id':'usage-ranking-container'},[E('div',{'class':'loading-state'},_('Loading...'))])]),E('div',{'class':'traffic-stats-section'},[E('div',{'class':'usage-ranking-header'},[E('h4',{'class':'usage-ranking-title'},[E('span',{},_('Traffic Timeline'))]),E('span',{'class':'usage-ranking-timerange','id':'traffic-increments-timerange'},'')]),E('div',{'class':'traffic-increments-query'},[E('div',{'class':'usage-ranking-date-range-row'},[E('div',{'class':'usage-ranking-date-picker-wrapper'},[E('label',{'class':'usage-ranking-date-label'},_('Start Date')),E('div',{'class':'usage-ranking-date-picker'},[E('input',{'type':'date','id':'traffic-increments-start-date','class':'cbi-input-date'})])]),E('span',{'class':'usage-ranking-date-separator'},'→'),E('div',{'class':'usage-ranking-date-picker-wrapper'},[E('label',{'class':'usage-ranking-date-label'},_('End Date')),E('div',{'class':'usage-ranking-date-picker'},[E('input',{'type':'date','id':'traffic-increments-end-date','class':'cbi-input-date'})])]),E('div',{'class':'usage-ranking-network-type-wrapper'},[E('label',{'class':'usage-ranking-network-label'},_('Network Type')),E('select',{'class':'cbi-input-select','id':'traffic-increments-network-type'},[E('option',{'value':'wan'},_('WAN Traffic')),E('option',{'value':'lan'},_('LAN Traffic')),E('option',{'value':'all'},_('Total'))])]),E('div',{'class':'usage-ranking-query-actions'},[E('button',{'class':'cbi-button cbi-button-action usage-ranking-query-btn','id':'traffic-increments-query-btn'},E('span',{},_('Query'))),E('button',{'class':'cbi-button cbi-button-reset','id':'traffic-increments-reset-btn'},_('Reset'))])]),E('div',{'class':'usage-ranking-query-presets'},[E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'today'},_('Today')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'thisweek'},_('This Week')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'lastweek'},_('Last Week')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'thismonth'},_('This Month')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'lastmonth'},_('Last Month')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'7days'},_('Last 7 Days')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'30days'},_('Last 30 Days')),E('button',{'class':'cbi-button cbi-button-neutral','data-preset':'90days'},_('Last 90 Days')),E('button',{'class':'cbi-button cbi-button-positive','data-preset':'1year'},_('Last Year'))]),E('div',{'class':'usage-ranking-timeline','id':'traffic-increments-timeline'},[E('div',{'class':'usage-ranking-timeline-range','id':'traffic-increments-timeline-range'})])]),E('div',{'class':'traffic-increments-filters'},[E('div',{'class':'traffic-increments-filter-group'},[E('label',{'class':'traffic-increments-filter-label'},_('Aggregation:')),E('select',{'class':'cbi-input-select','id':'traffic-increments-aggregation'},[E('option',{'value':'hourly'},_('Hourly')),E('option',{'value':'daily'},_('Daily'))])]),E('div',{'class':'traffic-increments-filter-group'},[E('label',{'class':'traffic-increments-filter-label'},_('Device:')),E('select',{'class':'cbi-input-select','id':'traffic-increments-mac'},[E('option',{'value':'all'},_('All Devices'))])])]),E('div',{'id':'traffic-increments-container'},[E('div',{'class':'loading-state'},_('Loading...'))])])])])])]);var scheduleRulesTooltip=E('div',{'class':'schedule-rules-tooltip','id':'schedule-rules-tooltip'});document.body.appendChild(scheduleRulesTooltip);var lanTrafficTooltip=E('div',{'class':'lan-traffic-tooltip','id':'lan-traffic-tooltip'});document.body.appendChild(lanTrafficTooltip);function buildScheduleRulesTooltipHtml(allRules,activeRules,speedUnit){if(!allRules||allRules.length===0){return'';}
var lines=[];lines.push('<div class="srt-title">'+_('Schedule Rules')+' ('+allRules.length+')</div>');allRules.forEach(function(rule,index){var startTime=rule.time_slot&&rule.time_slot.start?rule.time_slot.start:'';var endTime=rule.time_slot&&rule.time_slot.end?rule.time_slot.end:'';var days=rule.time_slot&&rule.time_slot.days?rule.time_slot.days:[];var dayNames={1:_('Mon'),2:_('Tue'),3:_('Wed'),4:_('Thu'),5:_('Fri'),6:_('Sat'),7:_('Sun')};var daysText=days.length>0?days.map(function(d){return dayNames[d]||d;}).join(', '):'-';var uploadLimit=rule.wan_tx_rate_limit||0;var downloadLimit=rule.wan_rx_rate_limit||0;var isActive=isRuleActive(rule);var uploadLimitText='<span class="srt-arrow" style="color: '+BANDIX_COLOR_UPLOAD+';">↑</span>'+(uploadLimit>0?formatByterate(uploadLimit,speedUnit):_('Unlimited'));var downloadLimitText='<span class="srt-arrow" style="color: '+BANDIX_COLOR_DOWNLOAD+';">↓</span>'+(downloadLimit>0?formatByterate(downloadLimit,speedUnit):_('Unlimited'));var activeMark=isActive?'<span style="color: #10b981; margin-right: 4px;">●</span>':'';lines.push('<div class="srt-rule-item">'+'<div class="srt-rule-time">'+activeMark+startTime+' - '+endTime+'</div>'+'<div class="srt-rule-days">'+daysText+'</div>'+'<div class="srt-rule-limits">'+uploadLimitText+' '+downloadLimitText+'</div>'+'</div>');});return lines.join('');}
var devicePeriodInit=localStorage.getItem('bandix_device_period');if(!devicePeriodInit||!/^(today|week|month|year|all)$/.test(devicePeriodInit)){localStorage.setItem('bandix_device_period','all');}
var deviceModeSelect=view.querySelector('#bandix_device_mode_select');if(deviceModeSelect){deviceModeSelect.addEventListener('change',function(){localStorage.setItem('bandix_device_mode',this.value);updateDeviceData();});}
var devicePeriodSelect=view.querySelector('#bandix_device_period_select');if(devicePeriodSelect){devicePeriodSelect.addEventListener('change',function(){localStorage.setItem('bandix_device_period',this.value);updateDeviceData();});}
var whitelistBadge=view.querySelector('#bandix_whitelist_badge');if(whitelistBadge){whitelistBadge.addEventListener('click',function(){showWhitelistModal();});}
var bandixModal=E('div',{'class':'bandix-modal-overlay','id':'rate-limit-bandix-modal'},[E('div',{'class':'modal-content bandix-modal'},[E('div',{'class':'bandix-modal-body',},[E('div',{'class':'device-summary','id':'bandix-modal-device-summary'}),E('div',{'class':'form-group'},[E('label',{'class':'form-label'},_('Hostname')),E('div',{'style':'display: flex; gap: 8px; align-items: center;'},[E('input',{'type':'text','class':'form-input','id':'device-hostname-input','placeholder':_('Please enter hostname'),'style':'flex: 1;'}),E('button',{'class':'cbi-button cbi-button-positive','id':'hostname-save-btn','style':'flex-shrink: 0;'},_('Save'))]),E('div',{'style':'font-size: 0.75rem; color: #6b7280; margin-top: 4px;'},_('Set Hostname'))]),E('div',{'id':'schedule-limit-tab'},[E('div',{'style':'display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;'},[E('span',{'style':'font-size: 0.875rem; opacity: 0.7;'},_('Set rate limit rules for different time periods')),E('button',{'type':'button','class':'cbi-button cbi-button-action','id':'schedule-add-rule-btn','style':'display: flex; align-items: center; gap: 4px;'},[E('span',{},'+'),_('Add Rule')])]),E('div',{'class':'schedule-rules-list','id':'schedule-rules-list'})])]),E('div',{'class':'bandix-modal-footer'},[E('button',{'class':'cbi-button cbi-button-reset','id':'bandix-modal-close'},_('Close'))])])]);document.body.appendChild(bandixModal);var addRuleModal=E('div',{'class':'bandix-modal-overlay','id':'add-rule-bandix-modal'},[E('div',{'class':'modal-content bandix-modal'},[E('div',{'class':'bandix-modal-header'},[E('h3',{'class':'bandix-modal-title'},_('Add Schedule Rule'))]),E('div',{'class':'bandix-modal-body'},[E('div',{'class':'form-group'},[E('label',{'class':'form-label'},_('Time Slot')),E('div',{'class':'schedule-time-row'},[E('input',{'type':'time','class':'schedule-time-input','id':'add-rule-start-time'}),E('span',{},' - '),E('input',{'type':'time','class':'schedule-time-input','id':'add-rule-end-time'})])]),E('div',{'class':'form-group'},[E('label',{'class':'form-label'},_('Days of Week')),E('div',{'class':'schedule-days','id':'add-rule-days'},[E('button',{'type':'button','class':'schedule-day-btn','data-day':'1'},_('Mon')),E('button',{'type':'button','class':'schedule-day-btn','data-day':'2'},_('Tue')),E('button',{'type':'button','class':'schedule-day-btn','data-day':'3'},_('Wed')),E('button',{'type':'button','class':'schedule-day-btn','data-day':'4'},_('Thu')),E('button',{'type':'button','class':'schedule-day-btn','data-day':'5'},_('Fri')),E('button',{'type':'button','class':'schedule-day-btn','data-day':'6'},_('Sat')),E('button',{'type':'button','class':'schedule-day-btn','data-day':'7'},_('Sun'))])]),E('div',{'class':'form-group'},[E('label',{'class':'form-label'},_('Upload Limit')),E('div',{'style':'display: flex; gap: 8px;'},[E('input',{'type':'number','class':'form-input','id':'add-rule-upload-limit-value','min':'0','step':'1','placeholder':'0'}),E('select',{'class':'cbi-input-select','id':'add-rule-upload-limit-unit','style':'width: 100px;'})]),E('div',{'style':'font-size: 0.75rem; color: #6b7280; margin-top: 4px;'},_('Tip: Enter 0 for unlimited'))]),E('div',{'class':'form-group','style':'margin-bottom: 0;'},[E('label',{'class':'form-label'},_('Download Limit')),E('div',{'style':'display: flex; gap: 8px;'},[E('input',{'type':'number','class':'form-input','id':'add-rule-download-limit-value','min':'0','step':'1','placeholder':'0'}),E('select',{'class':'cbi-input-select','id':'add-rule-download-limit-unit','style':'width: 100px;'})]),E('div',{'style':'font-size: 0.75rem; color: #6b7280; margin-top: 4px;'},_('Tip: Enter 0 for unlimited'))])]),E('div',{'class':'bandix-modal-footer'},[E('button',{'class':'cbi-button cbi-button-reset','id':'add-rule-cancel'},_('Cancel')),E('button',{'class':'cbi-button cbi-button-positive','id':'add-rule-save'},_('Add'))])])]);document.body.appendChild(addRuleModal);var confirmDialog=E('div',{'class':'bandix-modal-overlay','id':'confirm-dialog-bandix-modal'},[E('div',{'class':'modal-content bandix-modal confirm-dialog',"aria-modal":true},[E('div',{'class':'bandix-modal-body'},[E('div',{'class':'confirm-dialog-title','id':'confirm-dialog-title'},_('Confirm')),E('div',{'class':'confirm-dialog-message','id':'confirm-dialog-message'},''),E('div',{'class':'confirm-dialog-footer'},[E('button',{'class':'cbi-button cbi-button-reset','id':'confirm-dialog-cancel'},_('Cancel')),E('button',{'class':'cbi-button cbi-button-negative','id':'confirm-dialog-confirm'},_('Confirm'))])])])]);document.body.appendChild(confirmDialog);var whitelistModal=E('div',{'class':'whitelist-modal-overlay','id':'whitelist-modal'},[E('div',{'class':'whitelist-modal bandix-modal'},[E('div',{'class':'whitelist-modal-header'},[E('h3',{'class':'whitelist-modal-title'},_('Global Rate Limit'))]),E('div',{'class':'whitelist-modal-body'},[E('div',{'class':'whitelist-modal-row'},[E('div',{},[E('div',{'style':'font-weight: 600;'},_('Enabled')),E('div',{'class':'whitelist-modal-hint'},_('When enabled, all devices will be rate limited. Devices in the list are exempt (whitelist).'))]),E('input',{'type':'checkbox','id':'whitelist_enabled_checkbox'})]),E('div',{'style':'margin-top: 14px; font-weight: 600;'},_('Default Rate Limit')),E('div',{'class':'form-group','style':'margin-top: 12px;'},[E('label',{'class':'form-label'},_('Upload Limit')),E('div',{'style':'display: flex; gap: 8px;'},[E('input',{'type':'number','min':'0','step':'0.01','class':'form-input','id':'whitelist_default_wan_tx','placeholder':'0','style':'flex: 1;'}),E('select',{'class':'cbi-input-select','id':'whitelist_default_wan_tx_unit','style':'width: 110px; flex-shrink: 0;'},[E('option',{'value':'1024'},'KB/s'),E('option',{'value':'1048576'},'MB/s'),E('option',{'value':'1073741824'},'GB/s'),E('option',{'value':'125'},'Kbps'),E('option',{'value':'125000'},'Mbps'),E('option',{'value':'125000000'},'Gbps')])]),E('div',{'style':'font-size: 0.75rem; color: #6b7280; margin-top: 4px;'},_('Tip: Enter 0 for unlimited'))]),E('div',{'class':'form-group','style':'margin-top: 12px;'},[E('label',{'class':'form-label'},_('Download Limit')),E('div',{'style':'display: flex; gap: 8px;'},[E('input',{'type':'number','min':'0','step':'0.01','class':'form-input','id':'whitelist_default_wan_rx','placeholder':'0','style':'flex: 1;'}),E('select',{'class':'cbi-input-select','id':'whitelist_default_wan_rx_unit','style':'width: 110px; flex-shrink: 0;'},[E('option',{'value':'1024'},'KB/s'),E('option',{'value':'1048576'},'MB/s'),E('option',{'value':'1073741824'},'GB/s'),E('option',{'value':'125'},'Kbps'),E('option',{'value':'125000'},'Mbps'),E('option',{'value':'125000000'},'Gbps')])]),E('div',{'style':'font-size: 0.75rem; color: #6b7280; margin-top: 4px;'},_('Tip: Enter 0 for unlimited'))]),E('div',{'style':'display: flex; justify-content: flex-end; margin-top: 8px;'},[E('button',{'class':'cbi-button cbi-button-action','id':'whitelist_default_save_btn'},_('Save'))]),E('div',{'style':'margin-top: 8px; font-weight: 600;'},_('Exempt Devices (Whitelist)')),E('div',{'class':'whitelist-modal-list','id':'whitelist_macs_list'},[E('div',{'style':'text-align: center; opacity: 0.7; padding: 12px 0;'},_('Loading...'))]),E('div',{'style':'margin-top: 14px;'},[E('div',{'class':'whitelist-modal-row','style':'justify-content: flex-start;'},[E('select',{'class':'cbi-input-select','id':'whitelist_device_select','style':'width: 200px; flex-shrink: 0;'},[E('option',{'value':''},_('Select Device'))]),E('input',{'type':'text','class':'form-input','id':'whitelist_add_mac_input','placeholder':'aa:bb:cc:dd:ee:ff','style':'flex: 1;'}),E('button',{'class':'cbi-button cbi-button-positive','id':'whitelist_add_mac_btn','style':'flex-shrink: 0;'},_('Add'))]),E('div',{'class':'whitelist-modal-error','id':'whitelist-modal-error'},'')])]),E('div',{'class':'whitelist-modal-footer'},[E('button',{'class':'cbi-button cbi-button-reset','id':'whitelist-modal-close'},_('Close'))])])]);document.body.appendChild(whitelistModal);var confirmDialogCallback=null;function showConfirmDialog(title,message,onConfirm){document.getElementById('confirm-dialog-title').textContent=title||_('Confirm');document.getElementById('confirm-dialog-message').textContent=message||'';confirmDialogCallback=onConfirm;confirmDialog.classList.add('show');}
function hideConfirmDialog(){confirmDialog.classList.remove('show');confirmDialogCallback=null;}
document.getElementById('confirm-dialog-confirm').addEventListener('click',function(){if(confirmDialogCallback){confirmDialogCallback();}
hideConfirmDialog();});document.getElementById('confirm-dialog-cancel').addEventListener('click',hideConfirmDialog);confirmDialog.addEventListener('click',function(e){if(e.target===this){hideConfirmDialog();}});function parseWhitelistState(res){if(!res)return{enabled:false,macs:[]};if(res.success===false||res.error){throw new Error(res.error||_('Failed to load whitelist'));}
if(res.status&&res.status!=='success'){throw new Error(res.error||_('Failed to load whitelist'));}
var data=res.data?res.data:res;return{enabled:!!data.enabled,macs:Array.isArray(data.macs)?data.macs:[],default_wan_rx_rate_limit:data.default_wan_rx_rate_limit,default_wan_tx_rate_limit:data.default_wan_tx_rate_limit};}
function pickUnit(bytes){var n=parseFloat(bytes);if(isNaN(n)||n<0)return{value:'',unit:'1024'};if(n===0)return{value:0,unit:'1024'};if(n>=125000000&&Math.abs(n/125000000-Math.round(n/125000000))<1e-9)return{value:Math.round(n/125000000),unit:'125000000'};if(n>=125000&&Math.abs(n/125000-Math.round(n/125000))<1e-9)return{value:Math.round(n/125000),unit:'125000'};if(n>=125&&Math.abs(n/125-Math.round(n/125))<1e-9)return{value:Math.round(n/125),unit:'125'};if(n>=1073741824)return{value:+(n/1073741824).toFixed(2),unit:'1073741824'};if(n>=1048576)return{value:+(n/1048576).toFixed(2),unit:'1048576'};return{value:+(n/1024).toFixed(2),unit:'1024'};}
function unitToBytes(valStr,unitStr){var v=parseFloat((valStr||'').trim());var u=parseFloat(unitStr);if(isNaN(v)||v<0||isNaN(u)||u<=0)return null;return Math.round(v*u);}
function getDeviceLabel(d){var name=d&&(d.host||d.name)?(d.host||d.name):'';var ip=d&&d.ip4?d.ip4:'';var mac=d&&d.mac?d.mac:'';var left=name||ip||mac||'';var right=mac&&left!==mac?(' '+mac):'';return(left+right).trim();}
function populateWhitelistDeviceSelect(){var sel=document.getElementById('whitelist_device_select');if(!sel)return;var keep=sel.value;sel.innerHTML='';sel.appendChild(E('option',{'value':''},_('Select Device')));var devices=[];try{devices=(latestDevices&&latestDevices.length)?latestDevices:[];}catch(e){devices=[];}
if(!devices.length){sel.value='';return;}
devices.slice().sort(function(a,b){return getDeviceLabel(a).localeCompare(getDeviceLabel(b));}).forEach(function(d){if(!d||!d.mac)return;sel.appendChild(E('option',{'value':d.mac},getDeviceLabel(d)));});sel.value=keep;}
function setWhitelistError(msg){var el=document.getElementById('whitelist-modal-error');if(!el)return;if(msg){el.textContent=msg;el.style.display='block';}else{el.textContent='';el.style.display='none';}}
function updateWhitelistBadge(state){var badge=view.querySelector('#bandix_whitelist_badge');if(!badge)return;if(!state){badge.textContent=_('Unavailable');badge.style.backgroundColor='';return;}
var text=state.enabled?_('Enabled'):_('Disabled');var count=(state.macs&&state.macs.length)?state.macs.length:0;badge.textContent=text+' ('+count+')';}
function renderWhitelistList(macs){var listEl=document.getElementById('whitelist_macs_list');if(!listEl)return;listEl.innerHTML='';if(!macs||macs.length===0){listEl.appendChild(E('div',{'style':'text-align: center; opacity: 0.7; padding: 12px 0;'},_('No devices')));return;}
var deviceMap={};try{(latestDevices||[]).forEach(function(d){if(d&&d.mac)deviceMap[d.mac]=d;});}catch(e){deviceMap={};}
macs.slice().sort().forEach(function(mac){var d=deviceMap[mac];var hostname=d&&d.host?d.host:'';var ip=d&&d.ip4?d.ip4:'';var title=hostname||ip||mac;var item=E('div',{'class':'whitelist-modal-item'},[E('div',{'style':'display: flex; flex-direction: column; gap: 2px;'},[E('div',{'style':'font-weight: 600;'},title),E('div',{'style':'font-size: 0.75rem; opacity: 0.7;'},[ip?(ip+' · '):'',E('span',{'class':'whitelist-modal-mac'},mac)])]),E('button',{'class':'cbi-button cbi-button-negative','style':'padding: 4px 10px;'},_('Delete'))]);item.querySelector('button').addEventListener('click',function(){showConfirmDialog(_('Delete'),_('Remove this device from the list?'),function(){callDeleteRateLimitWhitelist(mac).then(function(){return loadWhitelistModal();}).then(function(){return refreshWhitelistStatus();}).catch(function(e){setWhitelistError(e&&e.message?e.message:_('Failed'));});});});listEl.appendChild(item);});}
function loadWhitelistModal(){setWhitelistError('');var listEl=document.getElementById('whitelist_macs_list');if(listEl)listEl.innerHTML='<div style="text-align: center; opacity: 0.7; padding: 12px 0;">'+_('Loading...')+'</div>';return callGetRateLimitWhitelist().then(function(res){var state=parseWhitelistState(res);var checkbox=document.getElementById('whitelist_enabled_checkbox');if(checkbox)checkbox.checked=!!state.enabled;var rxEl=document.getElementById('whitelist_default_wan_rx');var txEl=document.getElementById('whitelist_default_wan_tx');var rxUnitEl=document.getElementById('whitelist_default_wan_rx_unit');var txUnitEl=document.getElementById('whitelist_default_wan_tx_unit');var rxPicked=pickUnit(state.default_wan_rx_rate_limit);var txPicked=pickUnit(state.default_wan_tx_rate_limit);if(rxEl)rxEl.value=(rxPicked.value!=='')?String(rxPicked.value):'';if(txEl)txEl.value=(txPicked.value!=='')?String(txPicked.value):'';if(rxUnitEl)rxUnitEl.value=rxPicked.unit;if(txUnitEl)txUnitEl.value=txPicked.unit;renderWhitelistList(state.macs);return state;}).catch(function(e){var msg=(e&&e.message)?e.message:_('Failed to load whitelist');setWhitelistError(msg);if(listEl)listEl.innerHTML='<div style="text-align: center; opacity: 0.7; padding: 12px 0;">'+_('Failed')+'</div>';return null;});}
function refreshWhitelistStatus(){return callGetRateLimitWhitelist().then(function(res){var state=parseWhitelistState(res);updateWhitelistBadge(state);return state;}).catch(function(){updateWhitelistBadge(null);return null;});}
function showWhitelistModal(){whitelistModal.classList.add('show');populateWhitelistDeviceSelect();try{var sel=document.getElementById('whitelist_device_select');if(sel&&!sel.__bandixBound){sel.addEventListener('change',function(){var macInput=document.getElementById('whitelist_add_mac_input');if(macInput&&this.value)macInput.value=this.value;});sel.__bandixBound=true;}}catch(e){}
loadWhitelistModal();}
function hideWhitelistModal(){whitelistModal.classList.remove('show');setWhitelistError('');}
document.getElementById('whitelist-modal-close').addEventListener('click',hideWhitelistModal);document.getElementById('whitelist_enabled_checkbox').addEventListener('change',function(){var checkbox=this;checkbox.disabled=true;setWhitelistError('');callSetRateLimitWhitelistEnabled(checkbox.checked?1:0).then(function(){return loadWhitelistModal();}).then(function(){return refreshWhitelistStatus();}).catch(function(e){setWhitelistError(e&&e.message?e.message:_('Failed'));}).finally(function(){checkbox.disabled=false;});});document.getElementById('whitelist_add_mac_btn').addEventListener('click',function(){var input=document.getElementById('whitelist_add_mac_input');if(!input)return;var sel=document.getElementById('whitelist_device_select');var mac=(input.value||'').trim();if(!mac&&sel&&sel.value)mac=sel.value;var macRe=/^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/;if(!macRe.test(mac)){setWhitelistError(_('Invalid MAC address'));return;}
var btn=this;btn.disabled=true;setWhitelistError('');callAddRateLimitWhitelist(mac).then(function(){input.value='';if(sel)sel.value='';return loadWhitelistModal();}).then(function(){return refreshWhitelistStatus();}).catch(function(e){setWhitelistError(e&&e.message?e.message:_('Failed'));}).finally(function(){btn.disabled=false;});});document.getElementById('whitelist_default_save_btn').addEventListener('click',function(){var rxEl=document.getElementById('whitelist_default_wan_rx');var txEl=document.getElementById('whitelist_default_wan_tx');var rxUnitEl=document.getElementById('whitelist_default_wan_rx_unit');var txUnitEl=document.getElementById('whitelist_default_wan_tx_unit');if(!rxEl||!txEl||!rxUnitEl||!txUnitEl)return;var rxBytes=unitToBytes(rxEl.value,rxUnitEl.value);var txBytes=unitToBytes(txEl.value,txUnitEl.value);if(rxBytes==null||txBytes==null){setWhitelistError(_('Invalid value'));return;}
var btn=this;btn.disabled=true;setWhitelistError('');callSetDefaultRateLimit(rxBytes,txBytes).then(function(){return loadWhitelistModal();}).then(function(){return refreshWhitelistStatus();}).catch(function(e){setWhitelistError(e&&e.message?e.message:_('Failed'));}).finally(function(){btn.disabled=false;});});var addRuleDayButtons=addRuleModal.querySelectorAll('.schedule-day-btn');addRuleDayButtons.forEach(function(btn){btn.addEventListener('click',function(){this.classList.toggle('active');});});function showAddRuleModal(rule){if(!currentDevice)return;editingRule=rule||null;var addRuleModalEl=document.getElementById('add-rule-bandix-modal');var modalTitle=addRuleModalEl.querySelector('.bandix-modal-title');var saveButton=document.getElementById('add-rule-save');var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';if(editingRule){modalTitle.textContent=_('Edit Schedule Rule');saveButton.textContent=_('Save');}else{modalTitle.textContent=_('Add Schedule Rule');saveButton.textContent=_('Add');}
var uploadUnitSelect=document.getElementById('add-rule-upload-limit-unit');var downloadUnitSelect=document.getElementById('add-rule-download-limit-unit');uploadUnitSelect.innerHTML='';downloadUnitSelect.innerHTML='';if(speedUnit==='bits'){uploadUnitSelect.appendChild(E('option',{'value':'125'},'Kbps'));uploadUnitSelect.appendChild(E('option',{'value':'125000'},'Mbps'));uploadUnitSelect.appendChild(E('option',{'value':'125000000'},'Gbps'));downloadUnitSelect.appendChild(E('option',{'value':'125'},'Kbps'));downloadUnitSelect.appendChild(E('option',{'value':'125000'},'Mbps'));downloadUnitSelect.appendChild(E('option',{'value':'125000000'},'Gbps'));}else{uploadUnitSelect.appendChild(E('option',{'value':'1024'},'KB/s'));uploadUnitSelect.appendChild(E('option',{'value':'1048576'},'MB/s'));uploadUnitSelect.appendChild(E('option',{'value':'1073741824'},'GB/s'));downloadUnitSelect.appendChild(E('option',{'value':'1024'},'KB/s'));downloadUnitSelect.appendChild(E('option',{'value':'1048576'},'MB/s'));downloadUnitSelect.appendChild(E('option',{'value':'1073741824'},'GB/s'));}
if(editingRule){document.getElementById('add-rule-start-time').value=editingRule.time_slot&&editingRule.time_slot.start?editingRule.time_slot.start:'00:00';document.getElementById('add-rule-end-time').value=editingRule.time_slot&&editingRule.time_slot.end?editingRule.time_slot.end:'23:59';var dayButtons=addRuleModal.querySelectorAll('.schedule-day-btn');var selectedDays=editingRule.time_slot&&editingRule.time_slot.days?editingRule.time_slot.days:[];dayButtons.forEach(function(btn){var day=parseInt(btn.getAttribute('data-day'));if(selectedDays.indexOf(day)!==-1){btn.classList.add('active');}else{btn.classList.remove('active');}});var uploadLimit=editingRule.wan_tx_rate_limit||0;var downloadLimit=editingRule.wan_rx_rate_limit||0;var uploadUnit,uploadValue,downloadUnit,downloadValue;if(speedUnit==='bits'){if(uploadLimit>=125000000&&uploadLimit%125000000===0){uploadUnit='125000000';uploadValue=uploadLimit/125000000;}else if(uploadLimit>=125000&&uploadLimit%125000===0){uploadUnit='125000';uploadValue=uploadLimit/125000;}else{uploadUnit='125';uploadValue=Math.round(uploadLimit/125);}
if(downloadLimit>=125000000&&downloadLimit%125000000===0){downloadUnit='125000000';downloadValue=downloadLimit/125000000;}else if(downloadLimit>=125000&&downloadLimit%125000===0){downloadUnit='125000';downloadValue=downloadLimit/125000;}else{downloadUnit='125';downloadValue=Math.round(downloadLimit/125);}}else{if(uploadLimit>=1073741824&&uploadLimit%1073741824===0){uploadUnit='1073741824';uploadValue=uploadLimit/1073741824;}else if(uploadLimit>=1048576&&uploadLimit%1048576===0){uploadUnit='1048576';uploadValue=uploadLimit/1048576;}else{uploadUnit='1024';uploadValue=Math.round(uploadLimit/1024);}
if(downloadLimit>=1073741824&&downloadLimit%1073741824===0){downloadUnit='1073741824';downloadValue=downloadLimit/1073741824;}else if(downloadLimit>=1048576&&downloadLimit%1048576===0){downloadUnit='1048576';downloadValue=downloadLimit/1048576;}else{downloadUnit='1024';downloadValue=Math.round(downloadLimit/1024);}}
document.getElementById('add-rule-upload-limit-value').value=uploadValue;document.getElementById('add-rule-upload-limit-unit').value=uploadUnit;document.getElementById('add-rule-download-limit-value').value=downloadValue;document.getElementById('add-rule-download-limit-unit').value=downloadUnit;}else{resetAddRuleForm();}
addRuleModalEl.classList.add('show');}
function hideAddRuleModal(){var addRuleModalEl=document.getElementById('add-rule-bandix-modal');addRuleModalEl.classList.remove('show');editingRule=null;}
function resetAddRuleForm(){document.getElementById('add-rule-start-time').value='00:00';document.getElementById('add-rule-end-time').value='23:59';var dayButtons=addRuleModal.querySelectorAll('.schedule-day-btn');dayButtons.forEach(function(btn){btn.classList.add('active');});var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';document.getElementById('add-rule-upload-limit-value').value='0';document.getElementById('add-rule-download-limit-value').value='0';document.getElementById('add-rule-upload-limit-unit').value=speedUnit==='bits'?'125':'1024';document.getElementById('add-rule-download-limit-unit').value=speedUnit==='bits'?'125':'1024';}
var scheduleAddRuleBtn=document.getElementById('schedule-add-rule-btn');if(scheduleAddRuleBtn){scheduleAddRuleBtn.addEventListener('click',function(){showAddRuleModal();});}
document.getElementById('add-rule-cancel').addEventListener('click',hideAddRuleModal);document.getElementById('add-rule-save').addEventListener('click',function(){if(!currentDevice){console.error('No current device selected');return;}
var saveButton=this;var originalText=saveButton.textContent;saveButton.innerHTML='<span class="loading-spinner"></span>'+_('Adding...');saveButton.classList.add('btn-loading');saveButton.disabled=true;var startTime=document.getElementById('add-rule-start-time').value;var endTime=document.getElementById('add-rule-end-time').value;var addRuleModalEl=document.getElementById('add-rule-bandix-modal');var dayButtons=addRuleModalEl.querySelectorAll('.schedule-day-btn');var selectedDays=[];dayButtons.forEach(function(btn){if(btn.classList.contains('active')){selectedDays.push(parseInt(btn.getAttribute('data-day')));}});if(!startTime||!endTime){ui.addNotification(null,E('p',{},_('Please set time slot')),'error');saveButton.innerHTML=originalText;saveButton.classList.remove('btn-loading');saveButton.disabled=false;return;}
if(selectedDays.length===0){ui.addNotification(null,E('p',{},_('Please select at least one day')),'error');saveButton.innerHTML=originalText;saveButton.classList.remove('btn-loading');saveButton.disabled=false;return;}
var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';var scheduleUploadValue=parseInt(document.getElementById('add-rule-upload-limit-value').value)||0;var scheduleUploadUnit=parseInt(document.getElementById('add-rule-upload-limit-unit').value);var scheduleUploadLimit=scheduleUploadValue>0?scheduleUploadValue*scheduleUploadUnit:0;var scheduleDownloadValue=parseInt(document.getElementById('add-rule-download-limit-value').value)||0;var scheduleDownloadUnit=parseInt(document.getElementById('add-rule-download-limit-unit').value);var scheduleDownloadLimit=scheduleDownloadValue>0?scheduleDownloadValue*scheduleDownloadUnit:0;var apiCall;if(editingRule){console.log('Calling updateScheduleLimit:',{id:editingRule.id,mac:currentDevice.mac,startTime:startTime,endTime:endTime,days:selectedDays,downloadLimit:scheduleDownloadLimit,uploadLimit:scheduleUploadLimit});apiCall=callUpdateScheduleLimit(editingRule.id,currentDevice.mac,startTime,endTime,JSON.stringify(selectedDays),scheduleDownloadLimit,scheduleUploadLimit);}else{console.log('Calling setScheduleLimit:',{mac:currentDevice.mac,startTime:startTime,endTime:endTime,days:selectedDays,uploadLimit:scheduleUploadLimit,downloadLimit:scheduleDownloadLimit});apiCall=callSetScheduleLimit(currentDevice.mac,startTime,endTime,JSON.stringify(selectedDays),scheduleUploadLimit,scheduleDownloadLimit);}
apiCall.then(function(result){console.log('Schedule limit result:',result);saveButton.innerHTML=originalText;saveButton.classList.remove('btn-loading');saveButton.disabled=false;hideAddRuleModal();resetAddRuleForm();editingRule=null;loadScheduleRules();updateDeviceData();}).catch(function(error){console.error('Failed to save schedule rule:',error);saveButton.innerHTML=originalText;saveButton.classList.remove('btn-loading');saveButton.disabled=false;ui.addNotification(null,E('p',{},_('Failed to save schedule rule: ')+(error.message||error)),'error');});});var currentDevice=null;var editingRule=null;var showRateLimitModal;showRateLimitModal=function(device){currentDevice=device;var bandixModal=document.getElementById('rate-limit-bandix-modal');var deviceSummary=document.getElementById('bandix-modal-device-summary');var rulesList=document.getElementById('schedule-rules-list');if(rulesList){rulesList.innerHTML='<div class="schedule-rules-empty">'+
_('No scheduled rules yet, click "Add Rule" to start setting')+'</div>';}
loadScheduleRules();var modalContent=[E('div',{'class':'device-summary-name'},device.host||device.ip4),E('div',{'class':'device-summary-details'},device.ip4+' ('+device.mac+')')];var modalBadges=buildDeviceUplinkChBadges(device);if(modalBadges.length){modalContent.push(E('div',{'class':'device-summary-badges device-uplink-badges-wrap'},modalBadges));}
deviceSummary.innerHTML=E('div',{},modalContent).innerHTML;document.getElementById('device-hostname-input').value=device.host||'';bandixModal.classList.add('show');}
function hideRateLimitModal(){var bandixModal=document.getElementById('rate-limit-bandix-modal');bandixModal.classList.remove('show');setTimeout(function(){currentDevice=null;},300);}
function loadScheduleRules(){if(!currentDevice)return;var rulesList=document.getElementById('schedule-rules-list');if(!rulesList)return;rulesList.innerHTML='<div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 0.875rem;">'+_('Loading...')+'</div>';callGetScheduleLimits().then(function(res){if(!res){rulesList.innerHTML='<div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 0.875rem;">'+_('No schedule rules')+'</div>';return;}
if(res.success===false||res.error){var errorMsg=res.error||_('Failed to load schedule rules');rulesList.innerHTML='<div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 0.875rem; color: #ef4444;">'+errorMsg+'</div>';return;}
var limits=[];if(res.data&&res.data.limits&&Array.isArray(res.data.limits)){limits=res.data.limits;}else if(Array.isArray(res.limits)){limits=res.limits;}else if(Array.isArray(res)){limits=res;}
var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';var deviceRules=limits.filter(function(rule){return rule&&rule.mac===currentDevice.mac;});rulesList.innerHTML='';if(deviceRules.length===0){rulesList.innerHTML='<div class="schedule-rules-empty">'+
_('No scheduled rules yet, click "Add Rule" to start setting')+'</div>';return;}
deviceRules.forEach(function(rule){var daysText='';var dayNames={1:_('Mon'),2:_('Tue'),3:_('Wed'),4:_('Thu'),5:_('Fri'),6:_('Sat'),7:_('Sun')};if(rule.time_slot&&rule.time_slot.days&&Array.isArray(rule.time_slot.days)){daysText=rule.time_slot.days.map(function(d){return dayNames[d]||d;}).join(', ');}
var startTime=rule.time_slot&&rule.time_slot.start?rule.time_slot.start:'';var endTime=rule.time_slot&&rule.time_slot.end?rule.time_slot.end:'';var uploadLimit=rule.wan_tx_rate_limit||0;var downloadLimit=rule.wan_rx_rate_limit||0;var ruleItem=E('div',{'class':'schedule-rule-item'},[E('div',{'class':'schedule-rule-info'},[E('div',{'class':'schedule-rule-time'},startTime+' - '+endTime),E('div',{'class':'schedule-rule-days'},daysText),E('div',{'class':'schedule-rule-limits'},'↑ '+formatByterate(uploadLimit,speedUnit)+' / ↓ '+formatByterate(downloadLimit,speedUnit))]),E('div',{'class':'schedule-rule-actions'},[E('button',{'class':'schedule-rule-edit','title':_('Edit')},_('Edit')),E('button',{'class':'schedule-rule-delete','title':_('Delete')},_('Delete'))])]);ruleItem.querySelector('.schedule-rule-edit').addEventListener('click',function(){showAddRuleModal(rule);});ruleItem.querySelector('.schedule-rule-delete').addEventListener('click',function(){showConfirmDialog(_('Delete Schedule Rule'),_('Are you sure you want to delete this schedule rule?'),function(){callDeleteScheduleLimit(rule.id).then(function(){loadScheduleRules();updateDeviceData();}).catch(function(error){ui.addNotification(null,E('p',{},_('Failed to delete schedule rule')),'error');});});});rulesList.appendChild(ruleItem);});}).catch(function(error){console.error('Failed to load schedule rules:',error);var errorMsg=_('Failed to load schedule rules');if(error&&error.message){errorMsg+=': '+error.message;}
rulesList.innerHTML='<div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 0.875rem; color: #ef4444;">'+errorMsg+'</div>';});}
function saveHostname(){if(!currentDevice)return;var saveButton=document.getElementById('hostname-save-btn');var originalText=saveButton.textContent;var newHostname=document.getElementById('device-hostname-input').value.trim();if(newHostname===(currentDevice.host||'')){return;}
saveButton.innerHTML='<span class="loading-spinner"></span>'+_('Saving...');saveButton.classList.add('btn-loading');saveButton.disabled=true;callSetHostname(currentDevice.mac,newHostname).then(function(result){saveButton.innerHTML=originalText;saveButton.classList.remove('btn-loading');saveButton.disabled=false;currentDevice.host=newHostname;updateDeviceData();}).catch(function(error){saveButton.innerHTML=originalText;saveButton.classList.remove('btn-loading');saveButton.disabled=false;ui.addNotification(null,E('p',{},_('Failed to set hostname')),'error');});}
document.getElementById('hostname-save-btn').addEventListener('click',saveHostname);document.getElementById('bandix-modal-close').addEventListener('click',hideRateLimitModal);var latestDevices=[];var lastHistoryData=null;var isHistoryLoading=false;var allScheduleRules=[];var isScheduleRulesLoading=false;function fetchAllScheduleRules(){if(isScheduleRulesLoading)return Promise.resolve();isScheduleRulesLoading=true;return callGetScheduleLimits().then(function(res){isScheduleRulesLoading=false;if(!res){allScheduleRules=[];return;}
if(res.success===false||res.error){allScheduleRules=[];return;}
var limits=[];if(res.data&&res.data.limits&&Array.isArray(res.data.limits)){limits=res.data.limits;}else if(Array.isArray(res.limits)){limits=res.limits;}else if(Array.isArray(res)){limits=res;}
allScheduleRules=limits||[];}).catch(function(error){isScheduleRulesLoading=false;console.error('Failed to fetch schedule rules:',error);allScheduleRules=[];});}
function isRuleActive(rule){if(!rule||!rule.time_slot)return false;var now=new Date();var currentDay=now.getDay();var dayOfWeek=currentDay===0?7:currentDay;var days=rule.time_slot.days||[];if(!Array.isArray(days)||days.length===0)return false;if(days.indexOf(dayOfWeek)===-1)return false;var currentTime=('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2);var startTime=rule.time_slot.start||'';var endTime=rule.time_slot.end||'';if(!startTime||!endTime)return false;if(startTime<=endTime){return currentTime>=startTime&&currentTime<=endTime;}else{return currentTime>=startTime||currentTime<=endTime;}}
function getActiveRulesForDevice(mac){if(!allScheduleRules||allScheduleRules.length===0)return[];return allScheduleRules.filter(function(rule){return rule&&rule.mac===mac&&isRuleActive(rule);});}
function mergeActiveRulesLimits(activeRules){if(!activeRules||activeRules.length===0){return{uploadLimit:0,downloadLimit:0};}
var uploadLimits=[];var downloadLimits=[];activeRules.forEach(function(rule){var uploadLimit=rule.wan_tx_rate_limit||0;var downloadLimit=rule.wan_rx_rate_limit||0;if(uploadLimit>0){uploadLimits.push(uploadLimit);}
if(downloadLimit>0){downloadLimits.push(downloadLimit);}});var mergedUploadLimit=uploadLimits.length>0?Math.min.apply(Math,uploadLimits):0;var mergedDownloadLimit=downloadLimits.length>0?Math.min.apply(Math,downloadLimits):0;return{uploadLimit:mergedUploadLimit,downloadLimit:mergedDownloadLimit};}
function getTimeSlotDisplayText(activeRules){if(!activeRules||activeRules.length===0){return'';}
if(activeRules.length===1){var rule=activeRules[0];var startTime=rule.time_slot&&rule.time_slot.start?rule.time_slot.start:'';var endTime=rule.time_slot&&rule.time_slot.end?rule.time_slot.end:'';return startTime+'-'+endTime;}
var firstRule=activeRules[0];var firstStartTime=firstRule.time_slot&&firstRule.time_slot.start?firstRule.time_slot.start:'';var firstEndTime=firstRule.time_slot&&firstRule.time_slot.end?firstRule.time_slot.end:'';var allSame=true;for(var i=1;i<activeRules.length;i++){var rule=activeRules[i];var startTime=rule.time_slot&&rule.time_slot.start?rule.time_slot.start:'';var endTime=rule.time_slot&&rule.time_slot.end?rule.time_slot.end:'';if(startTime!==firstStartTime||endTime!==firstEndTime){allSame=false;break;}}
if(allSame){return firstStartTime+'-'+firstEndTime+' ('+activeRules.length+' '+_('rules')+')';}else{return _('Multiple time slots')+' ('+activeRules.length+' '+_('rules')+')';}}
var currentSortBy=localStorage.getItem('bandix_sort_by')||'online';var currentSortOrder=localStorage.getItem('bandix_sort_order')==='true';var historyHover=false;var historyHoverIndex=null;var zoomEnabled=false;var zoomScale=1;var zoomOffsetX=0;var zoomTimer=null;function updateDeviceOptions(devices){var select=document.getElementById('history-device-select');if(!select)return;var sortedDevices=devices.slice().sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline&&!bOnline)return-1;if(!aOnline&&bOnline)return 1;var aIp=a.ip4||'';var bIp=b.ip4||'';var aIpParts=aIp.split('.').map(function(part){return parseInt(part)||0;});var bIpParts=bIp.split('.').map(function(part){return parseInt(part)||0;});for(var i=0;i<4;i++){var aPart=aIpParts[i]||0;var bPart=bIpParts[i]||0;if(aPart!==bPart){return aPart-bPart;}}
return(a.mac||'').localeCompare(b.mac||'');});var currentValues=Array.from(select.options).map(o=>o.value);var desiredValues=[''].concat(sortedDevices.map(d=>d.mac));var same=currentValues.length===desiredValues.length&&currentValues.every((v,i)=>v===desiredValues[i]);if(same)return;var prev=select.value;select.innerHTML='';select.appendChild(E('option',{'value':''},_('All Devices')));sortedDevices.forEach(function(d){var label=(d.host||d.ip4||d.mac||'-')+(d.ip4?' ('+d.ip4+')':'')+(d.mac?' ['+d.mac+']':'');select.appendChild(E('option',{'value':d.mac},label));});if(desiredValues.indexOf(prev)!==-1)select.value=prev;}
function getTypeKeys(type){if(type==='lan')return{up:'lan_tx_rate',down:'lan_rx_rate'};if(type==='wan')return{up:'wan_tx_rate',down:'wan_rx_rate'};return{up:'total_tx_rate',down:'total_rx_rate'};}
function fetchMetricsData(mac){return callGetMetrics(mac||'').then(function(res){return res||{metrics:[]};});}
function convertMetricsArrayToObjects(metricsArray){if(!Array.isArray(metricsArray)){return[];}
return metricsArray.map(function(arr){return{ts_ms:arr[0]||0,total_rx_rate:arr[1]||0,total_tx_rate:arr[2]||0,lan_rx_rate:arr[3]||0,lan_tx_rate:arr[4]||0,wan_rx_rate:arr[5]||0,wan_tx_rate:arr[6]||0,total_rx_bytes:arr[7]||0,total_tx_bytes:arr[8]||0,lan_rx_bytes:arr[9]||0,lan_tx_bytes:arr[10]||0,wan_rx_bytes:arr[11]||0,wan_tx_bytes:arr[12]||0,is_aggregated:false};}).filter(function(item){return item!==null;});}
function drawHistoryChartWithZoom(canvas,labels,upSeries,downSeries){drawHistoryChart(canvas,labels,upSeries,downSeries,zoomScale,zoomOffsetX);}
function updateZoomLevelDisplay(){var zoomLevelElement=document.getElementById('history-zoom-level');if(!zoomLevelElement)return;zoomLevelElement.style.display='none';return;if(zoomScale<=1){zoomLevelElement.style.display='none';}else{zoomLevelElement.style.display='inline-block';zoomLevelElement.textContent=_('Zoom')+': '+zoomScale.toFixed(1)+'x';}}
function drawHistoryChart(canvas,labels,upSeries,downSeries,scale,offsetX){if(!canvas)return;scale=scale||1;offsetX=offsetX||0;var dpr=window.devicePixelRatio||1;var rect=canvas.getBoundingClientRect();var cssWidth=rect.width;var cssHeight=rect.height;canvas.width=Math.max(1,Math.floor(cssWidth*dpr));canvas.height=Math.max(1,Math.floor(cssHeight*dpr));var ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);var width=cssWidth;var height=cssHeight;var isMobile=width<=768;var padding=isMobile?{left:50,right:20,top:12,bottom:28}:{left:90,right:50,top:16,bottom:36};ctx.clearRect(0,0,width,height);var originalLabels=labels;var originalUpSeries=upSeries;var originalDownSeries=downSeries;if(scale>1){var totalLen=labels.length;var visibleLen=Math.ceil(totalLen/scale);var startIdx=Math.max(0,Math.floor(offsetX));var endIdx=Math.min(totalLen,startIdx+visibleLen);labels=labels.slice(startIdx,endIdx);upSeries=upSeries.slice(startIdx,endIdx);downSeries=downSeries.slice(startIdx,endIdx);}
var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';var maxVal=0;for(var i=0;i<upSeries.length;i++)maxVal=Math.max(maxVal,upSeries[i]||0);for(var j=0;j<downSeries.length;j++)maxVal=Math.max(maxVal,downSeries[j]||0);if(!isFinite(maxVal)||maxVal<=0)maxVal=1;var fontSize=isMobile?10:12;ctx.font=fontSize+'px sans-serif';var maxLabelText=formatByterate(maxVal,speedUnit);var zeroLabelText=formatByterate(0,speedUnit);var maxLabelWidth=Math.max(ctx.measureText(maxLabelText).width,ctx.measureText(zeroLabelText).width);padding.left=Math.max(padding.left,Math.ceil(maxLabelWidth)+(isMobile?20:30));var rightMin=isMobile?20:50;padding.right=Math.max(padding.right,rightMin);var innerW=Math.max(1,width-padding.left-padding.right);var innerH=Math.max(1,height-padding.top-padding.bottom);var prevHover=(canvas.__bandixChart&&typeof canvas.__bandixChart.hoverIndex==='number')?canvas.__bandixChart.hoverIndex:undefined;canvas.__bandixChart={padding:padding,innerW:innerW,innerH:innerH,width:width,height:height,labels:labels,upSeries:upSeries,downSeries:downSeries,scale:scale,offsetX:offsetX,originalLabels:originalLabels,originalUpSeries:originalUpSeries,originalDownSeries:originalDownSeries};if(typeof prevHover==='number')canvas.__bandixChart.hoverIndex=prevHover;var gridLines=4;ctx.strokeStyle='rgba(148,163,184,0.08)';ctx.lineWidth=0.8;for(var g=0;g<=gridLines;g++){var y=padding.top+(innerH*g/gridLines);ctx.beginPath();ctx.moveTo(padding.left,y);ctx.lineTo(width-padding.right,y);ctx.stroke();var val=Math.round(maxVal*(gridLines-g)/gridLines);ctx.fillStyle='#9ca3af';ctx.font=fontSize+'px sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';var yLabelY=(g===gridLines)?y-4:y;ctx.fillText(formatByterate(val,speedUnit),padding.left-(isMobile?6:8),yLabelY);}
function drawAreaSeries(series,color,gradientFrom,gradientTo){if(!series||series.length===0)return;var n=series.length;var stepX=n>1?(innerW/(n-1)):0;ctx.beginPath();for(var k=0;k<n;k++){var v=Math.max(0,series[k]||0);var x=padding.left+(n>1?stepX*k:innerW/2);var y=padding.top+innerH-(v/maxVal)*innerH;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
ctx.lineTo(padding.left+innerW,padding.top+innerH);ctx.lineTo(padding.left,padding.top+innerH);ctx.closePath();var grad=ctx.createLinearGradient(0,padding.top,0,padding.top+innerH);grad.addColorStop(0,gradientFrom);grad.addColorStop(1,gradientTo);ctx.fillStyle=grad;ctx.fill();ctx.beginPath();for(var k2=0;k2<n;k2++){var v2=Math.max(0,series[k2]||0);var x2=padding.left+(n>1?stepX*k2:innerW/2);var y2=padding.top+innerH-(v2/maxVal)*innerH;if(k2===0)ctx.moveTo(x2,y2);else ctx.lineTo(x2,y2);}
ctx.strokeStyle=color;ctx.lineWidth=isMobile?1.5:1.2;ctx.stroke();}
drawAreaSeries(upSeries,BANDIX_COLOR_UPLOAD,'rgba(249,115,22,0.16)','rgba(249,115,22,0.02)');drawAreaSeries(downSeries,BANDIX_COLOR_DOWNLOAD,'rgba(6,182,212,0.12)','rgba(6,182,212,0.02)');if(labels&&labels.length>0){ctx.fillStyle='#9ca3af';ctx.font=fontSize+'px sans-serif';ctx.textBaseline='top';var firstX=padding.left;var lastX=width-padding.right;var yBase=height-padding.bottom+(isMobile?2:4);ctx.textAlign='left';ctx.fillText(labels[0],firstX,yBase);if(labels.length>1){ctx.textAlign='right';ctx.fillText(labels[labels.length-1],lastX,yBase);}}
try{if(isMobile)return;var info=canvas.__bandixChart||{};var useIdx=null;if(typeof historyHoverIndex==='number')useIdx=historyHoverIndex;else if(typeof info.hoverIndex==='number')useIdx=info.hoverIndex;if(useIdx!==null&&info.labels&&info.labels.length>0){var n=info.labels.length;var stepX=n>1?(innerW/(n-1)):0;var hoverIdx=useIdx;if(scale>1&&originalLabels&&originalLabels.length>0){var startIdx=Math.floor(offsetX||0);hoverIdx=useIdx-startIdx;if(hoverIdx<0||hoverIdx>=n){hoverIdx=null;}}
if(hoverIdx!==null){hoverIdx=Math.max(0,Math.min(n-1,hoverIdx));var hoverX=info.padding.left+(n>1?stepX*hoverIdx:innerW/2);ctx.save();ctx.strokeStyle='rgba(156,163,175,0.9)';ctx.lineWidth=1;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(hoverX,padding.top);ctx.lineTo(hoverX,padding.top+innerH);ctx.stroke();ctx.setLineDash([]);ctx.restore();}}}catch(e){}}
function msToTimeLabel(ts){var d=new Date(ts);var hh=(''+d.getHours()).padStart(2,'0');var mm=(''+d.getMinutes()).padStart(2,'0');var ss=(''+d.getSeconds()).padStart(2,'0');return hh+':'+mm+':'+ss;}
function msToFullDateTimeLabel(ts){var d=new Date(ts);var year=d.getFullYear();var month=(''+(d.getMonth()+1)).padStart(2,'0');var day=(''+d.getDate()).padStart(2,'0');var hh=(''+d.getHours()).padStart(2,'0');var mm=(''+d.getMinutes()).padStart(2,'0');var ss=(''+d.getSeconds()).padStart(2,'0');return year+'-'+month+'-'+day+' '+hh+':'+mm+':'+ss;}
function buildTooltipHtml(point){if(!point)return'';var lines=[];var typeSel=(typeof document!=='undefined'?document.getElementById('history-type-select'):null);var selType=(typeSel&&typeSel.value)?typeSel.value:'total';var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';var isAggregated=point.is_aggregated||false;function row(label,val){lines.push('<div class="ht-row"><span class="ht-key">'+label+'</span><span class="ht-val">'+val+'</span></div>');}
function rateValue(key){return formatByterate(point[key]||0,speedUnit);}
function bytesValue(key){return formatSize(point[key]||0);}
function labelsFor(type){if(type==='lan')return{up:_('LAN Upload'),down:_('LAN Download')};if(type==='wan')return{up:_('WAN Upload'),down:_('WAN Download')};return{up:_('Total Upload'),down:_('Total Download')};}
function rateKeysFor(type){if(type==='lan')return{up:'lan_tx_rate',down:'lan_rx_rate'};if(type==='wan')return{up:'wan_tx_rate',down:'wan_rx_rate'};return{up:'total_tx_rate',down:'total_rx_rate'};}
function bytesKeysFor(type){if(type==='lan')return{up:'lan_tx_bytes',down:'lan_rx_bytes'};if(type==='wan')return{up:'wan_tx_bytes',down:'wan_rx_bytes'};return{up:'total_tx_bytes',down:'total_rx_bytes'};}
if(isAggregated){lines.push('<div class="ht-title">'+msToFullDateTimeLabel(point.ts_ms)+'</div>');}else{lines.push('<div class="ht-title">'+msToTimeLabel(point.ts_ms)+'</div>');}
var kpiLabels=labelsFor(selType);var kpiRateKeys=rateKeysFor(selType);if(isAggregated){lines.push('<div class="ht-kpis">'+'<div class="ht-kpi up">'+'<div class="ht-k-label">'+_('WAN Upload')+' (P95)</div>'+'<div class="ht-k-value">'+formatByterate(point.w_tx_p95||0,speedUnit)+'</div>'+'</div>'+'<div class="ht-kpi down">'+'<div class="ht-k-label">'+_('WAN Download')+' (P95)</div>'+'<div class="ht-k-value">'+formatByterate(point.w_rx_p95||0,speedUnit)+'</div>'+'</div>'+'</div>');lines.push('<div class="ht-divider"></div>');lines.push('<div class="ht-section-title">'+_('Upload Statistics')+'</div>');row(_('Average'),formatByterate(point.w_tx_avg||0,speedUnit));row(_('Maximum'),formatByterate(point.w_tx_max||0,speedUnit));row(_('Minimum'),formatByterate(point.w_tx_min||0,speedUnit));row('P90',formatByterate(point.w_tx_p90||0,speedUnit));row('P95',formatByterate(point.w_tx_p95||0,speedUnit));row('P99',formatByterate(point.w_tx_p99||0,speedUnit));lines.push('<div class="ht-section-title" style="margin-top: 8px;">'+_('Download Statistics')+'</div>');row(_('Average'),formatByterate(point.w_rx_avg||0,speedUnit));row(_('Maximum'),formatByterate(point.w_rx_max||0,speedUnit));row(_('Minimum'),formatByterate(point.w_rx_min||0,speedUnit));row('P90',formatByterate(point.w_rx_p90||0,speedUnit));row('P95',formatByterate(point.w_rx_p95||0,speedUnit));row('P99',formatByterate(point.w_rx_p99||0,speedUnit));lines.push('<div class="ht-divider"></div>');lines.push('<div class="ht-section-title">'+_('Cumulative Traffic')+'</div>');row(_('WAN Uploaded'),bytesValue('wan_tx_bytes'));row(_('WAN Downloaded'),bytesValue('wan_rx_bytes'));}else{lines.push('<div class="ht-kpis">'+'<div class="ht-kpi up">'+'<div class="ht-k-label">'+kpiLabels.up+'</div>'+'<div class="ht-k-value">'+rateValue(kpiRateKeys.up)+'</div>'+'</div>'+'<div class="ht-kpi down">'+'<div class="ht-k-label">'+kpiLabels.down+'</div>'+'<div class="ht-k-value">'+rateValue(kpiRateKeys.down)+'</div>'+'</div>'+'</div>');var otherTypes=['total','lan','wan'].filter(function(t){return t!==selType;});if(otherTypes.length){lines.push('<div class="ht-section-title">'+_('Other Rates')+'</div>');otherTypes.forEach(function(t){var lbs=labelsFor(t);var ks=rateKeysFor(t);row(lbs.up,rateValue(ks.up));row(lbs.down,rateValue(ks.down));});}
lines.push('<div class="ht-divider"></div>');lines.push('<div class="ht-section-title">'+_('Cumulative')+'</div>');row(_('LAN Uploaded'),bytesValue('lan_tx_bytes'));row(_('LAN Downloaded'),bytesValue('lan_rx_bytes'));row(_('WAN Uploaded'),bytesValue('wan_tx_bytes'));row(_('WAN Downloaded'),bytesValue('wan_rx_bytes'));row(_('Total Uploaded'),bytesValue('total_tx_bytes'));row(_('Total Downloaded'),bytesValue('total_rx_bytes'));}
return lines.join('');}
function compareIP(aIp,bIp){var aIpParts=(aIp||'').split('.').map(function(part){return parseInt(part)||0;});var bIpParts=(bIp||'').split('.').map(function(part){return parseInt(part)||0;});for(var i=0;i<4;i++){var aPart=aIpParts[i]||0;var bPart=bIpParts[i]||0;if(aPart!==bPart){return aPart-bPart;}}
return 0;}
function sortDevices(devices,sortBy,ascending){if(!devices||!Array.isArray(devices))return devices;var sortedDevices=devices.slice();switch(sortBy){case'online':sortedDevices.sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline!==bOnline){return ascending?(aOnline?1:-1):(aOnline?-1:1);}
var ipCompare=compareIP(a.ip4,b.ip4);if(ipCompare!==0)return ipCompare;return(a.mac||'').localeCompare(b.mac||'');});break;case'lan_speed':sortedDevices.sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline!==bOnline){return aOnline?-1:1;}
var aSpeed=(a.l_tx_r||0)+(a.l_rx_r||0);var bSpeed=(b.l_tx_r||0)+(b.l_rx_r||0);if(aSpeed!==bSpeed){return ascending?(aSpeed-bSpeed):(bSpeed-aSpeed);}
return compareIP(a.ip4,b.ip4);});break;case'wan_speed':sortedDevices.sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline!==bOnline){return aOnline?-1:1;}
var aSpeed=(a.w_tx_r||0)+(a.w_rx_r||0);var bSpeed=(b.w_tx_r||0)+(b.w_rx_r||0);if(aSpeed!==bSpeed){return ascending?(aSpeed-bSpeed):(bSpeed-aSpeed);}
return compareIP(a.ip4,b.ip4);});break;case'lan_traffic':sortedDevices.sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline!==bOnline){return aOnline?-1:1;}
var aTraffic=(a.l_tx_b||0)+(a.l_rx_b||0);var bTraffic=(b.l_tx_b||0)+(b.l_rx_b||0);if(aTraffic!==bTraffic){return ascending?(aTraffic-bTraffic):(bTraffic-aTraffic);}
return compareIP(a.ip4,b.ip4);});break;case'wan_traffic':sortedDevices.sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline!==bOnline){return aOnline?-1:1;}
var aTraffic=(a.w_tx_b||0)+(a.w_rx_b||0);var bTraffic=(b.w_tx_b||0)+(b.w_rx_b||0);if(aTraffic!==bTraffic){return ascending?(aTraffic-bTraffic):(bTraffic-aTraffic);}
return compareIP(a.ip4,b.ip4);});break;default:sortedDevices.sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline!==bOnline){return aOnline?-1:1;}
var ipCompare=compareIP(a.ip4,b.ip4);if(ipCompare!==0)return ipCompare;return(a.mac||'').localeCompare(b.mac||'');});}
return sortedDevices;}
function isDeviceOnline(device){if(typeof device.last==='undefined'){return device.online!==false;}
if(!device.last||device.last<=0){return false;}
var currentTime=Date.now();var lastOnlineTime=device.last<1000000000000?device.last*1000:device.last;var timeDiff=currentTime-lastOnlineTime;var offlineTimeoutSeconds=uci.get('bandix','traffic','offline_timeout')||600;var offlineThreshold=offlineTimeoutSeconds*1000;return timeDiff<=offlineThreshold;}
function channelToBand(ch){var c=Number(ch);if(c<1)return null;if(c<=14)return'2.4 GHz';if(c<=165)return'5 GHz';if(c<=233)return'6 GHz';return null;}
function channelToBandClass(ch){var c=Number(ch);if(c<=14)return'g24';if(c<=165)return'g5';if(c<=233)return'g6';return'';}
function buildDeviceUplinkChBadges(device){var badges=[];if(device.uplink&&String(device.uplink).trim()!==''){badges.push(E('span',{'class':'device-uplink-badge','title':_('Interface')},device.uplink.trim()));}
if(device.w_ch&&Number(device.w_ch)>0){var ch=Number(device.w_ch);var band=channelToBand(ch);var bandClass=channelToBandClass(ch);if(band&&bandClass){badges.push(E('span',{'class':'device-ch-badge device-ch-'+bandClass,'title':_('WiFi Channel')+' '+ch},band));}}
return badges;}
function formatDeviceUplinkCh(device){var parts=[];if(device.uplink&&String(device.uplink).trim()!=='')parts.push(device.uplink.trim());if(device.w_ch&&Number(device.w_ch)>0){var band=channelToBand(Number(device.w_ch));if(band)parts.push(band);}
return parts.join(' · ');}
function formatLastOnlineTime(lastOnlineTs){if(!lastOnlineTs||lastOnlineTs<=0){return _('Never Online');}
var lastOnlineTime=lastOnlineTs<1000000000000?lastOnlineTs*1000:lastOnlineTs;var currentTime=Date.now();var timeDiff=currentTime-lastOnlineTime;var minutesDiff=Math.floor(timeDiff/(60*1000));if(minutesDiff<1){return _('Just Now');}
if(minutesDiff<=10){return minutesDiff+_('min ago');}
var hoursDiff=Math.floor(timeDiff/(60*60*1000));if(hoursDiff<1){return minutesDiff+_('min ago');}
var daysDiff=Math.floor(timeDiff/(24*60*60*1000));if(daysDiff<1){return hoursDiff+_('h ago');}
var monthsDiff=Math.floor(daysDiff/30);if(monthsDiff<1){return daysDiff+_('days ago');}
var yearsDiff=Math.floor(daysDiff/365);if(yearsDiff<1){return monthsDiff+_('months ago');}
return yearsDiff+_('years ago');}
function formatLastOnlineExactTime(lastOnlineTs){if(!lastOnlineTs||lastOnlineTs<=0){return'-';}
var lastOnlineTime=lastOnlineTs<1000000000000?lastOnlineTs*1000:lastOnlineTs;var date=new Date(lastOnlineTime);if(isNaN(date.getTime())){return'-';}
function pad(value){return value<10?'0'+value:value;}
return date.getFullYear()+'-'+
pad(date.getMonth()+1)+'-'+
pad(date.getDate())+' '+
pad(date.getHours())+':'+
pad(date.getMinutes())+':'+
pad(date.getSeconds());}
function formatRetentionSeconds(seconds){if(!seconds||seconds<=0)return'';if(seconds===600){return _('Last 10 Minutes');}
if(seconds===900){return _('Last 15 Minutes');}
if(seconds===1800){return _('Last 30 Minutes');}
if(seconds===3600){return _('Last 1 Hour');}
if(seconds===86400){return _('Last 24 Hours');}
if(seconds===604800){return _('Last 7 Days');}
if(seconds===2592000){return _('Last 30 Days');}
var value;var unitKey;if(seconds<60){value=Math.round(seconds);unitKey=_('seconds');}else if(seconds<3600){value=Math.round(seconds/60);if(value<1)value=1;unitKey=_('minutes');}else if(seconds<86400){value=Math.round(seconds/3600);if(value<1)value=1;unitKey=_('hours');}else if(seconds<604800){value=Math.round(seconds/86400);if(value<1)value=1;unitKey=_('days');}else{value=Math.round(seconds/604800);if(value<1)value=1;unitKey=_('weeks');}
return _('Last')+' '+value+' '+unitKey;}
function downsampleForMobile(data,labels,upSeries,downSeries,maxPoints){if(!data||data.length<=maxPoints){return{data:data,labels:labels,upSeries:upSeries,downSeries:downSeries,indices:data.map(function(_,i){return i;})};}
var n=data.length;var sampledData=[];var sampledLabels=[];var sampledUp=[];var sampledDown=[];var indices=[];var step=(n-1)/(maxPoints-1);for(var i=0;i<maxPoints;i++){var idx=Math.round(i*step);idx=Math.min(idx,n-1);sampledData.push(data[idx]);sampledLabels.push(labels[idx]);sampledUp.push(upSeries[idx]);sampledDown.push(downSeries[idx]);indices.push(idx);}
if(indices[0]!==0){sampledData[0]=data[0];sampledLabels[0]=labels[0];sampledUp[0]=upSeries[0];sampledDown[0]=downSeries[0];indices[0]=0;}
if(indices[indices.length-1]!==n-1){var lastIdx=sampledData.length-1;sampledData[lastIdx]=data[n-1];sampledLabels[lastIdx]=labels[n-1];sampledUp[lastIdx]=upSeries[lastIdx];sampledDown[lastIdx]=downSeries[lastIdx];indices[lastIdx]=n-1;}
return{data:sampledData,labels:sampledLabels,upSeries:sampledUp,downSeries:sampledDown,indices:indices};}
function refreshHistory(){if(historyHover)return Promise.resolve();var mac=document.getElementById('history-device-select')?.value||'';var type=document.getElementById('history-type-select')?.value||'total';var canvas=document.getElementById('history-canvas');var tooltip=document.getElementById('history-tooltip');if(!canvas)return Promise.resolve();if(isHistoryLoading)return Promise.resolve();isHistoryLoading=true;return fetchMetricsData(mac).then(function(res){var rawMetrics=res&&res.metrics?res.metrics:[];var data=convertMetricsArrayToObjects(rawMetrics);lastHistoryData=data;var retentionBadge=document.getElementById('history-retention');if(retentionBadge){var text=formatRetentionSeconds(res&&res.retention_seconds);retentionBadge.textContent=text||'';}
if(!data.length){var ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);drawHistoryChart(canvas,[],[],[],1,0);return;}
var filtered=data.slice();filtered.sort(function(a,b){return(a.ts_ms||0)-(b.ts_ms||0);});var screenWidth=window.innerWidth||document.documentElement.clientWidth;var isMobileScreen=screenWidth<=768;var displayData=filtered;var indexMapping=null;var timeRangeBadge=document.getElementById('history-time-range');if(isMobileScreen&&filtered.length>0){var currentTime=Date.now();var twentySecondsAgo=currentTime-20000;var recentData=filtered.filter(function(item){var ts=item.ts_ms||0;if(ts<1000000000000)ts=ts*1000;return ts>=twentySecondsAgo;});if(recentData.length===0&&filtered.length>0){recentData=filtered.slice(-20);}
if(recentData.length>20){var keys=getTypeKeys(type);var tempUpSeries=recentData.map(function(x){return x[keys.up]||0;});var tempDownSeries=recentData.map(function(x){return x[keys.down]||0;});var tempLabels=recentData.map(function(x){return msToTimeLabel(x.ts_ms);});var sampled=downsampleForMobile(recentData,tempLabels,tempUpSeries,tempDownSeries,20);filtered=sampled.data;indexMapping=sampled.indices;}else{filtered=recentData;indexMapping=recentData.map(function(_,i){return i;});}
displayData=recentData;}else{indexMapping=filtered.map(function(_,i){return i;});}
var keys=getTypeKeys(type);var upSeries=filtered.map(function(x){return x[keys.up]||0;});var downSeries=filtered.map(function(x){return x[keys.down]||0;});var labels=filtered.map(function(x){return msToTimeLabel(x.ts_ms);});if(canvas){canvas.__bandixIndexMapping=indexMapping;canvas.__bandixDisplayData=displayData;}
drawHistoryChartWithZoom(canvas,labels,upSeries,downSeries);function findNearestIndex(evt){var rect=canvas.getBoundingClientRect();var x=evt.clientX-rect.left;var info=canvas.__bandixChart;if(!info||!info.labels||info.labels.length===0)return-1;var n=info.labels.length;var stepX=n>1?(info.innerW/(n-1)):0;var minIdx=0;var minDist=Infinity;for(var k=0;k<n;k++){var px=info.padding.left+(n>1?stepX*k:info.innerW/2);var dist=Math.abs(px-x);if(dist<minDist){minDist=dist;minIdx=k;}}
if(info.scale&&info.scale>1&&info.originalLabels){var startIdx=Math.floor(info.offsetX||0);minIdx=startIdx+minIdx;}
var indexMapping=canvas.__bandixIndexMapping;if(indexMapping&&indexMapping[minIdx]!==undefined){return indexMapping[minIdx];}
return minIdx;}
function onMove(evt){var screenWidth=window.innerWidth||document.documentElement.clientWidth;if(screenWidth<=768){if(tooltip)tooltip.style.display='none';return;}
if(!tooltip)return;var idx=findNearestIndex(evt);var dataSource=(canvas&&canvas.__bandixDisplayData)?canvas.__bandixDisplayData:lastHistoryData;if(idx<0||!dataSource||!dataSource[idx]){tooltip.style.display='none';historyHover=false;try{if(canvas&&canvas.__bandixChart){delete canvas.__bandixChart.hoverIndex;drawHistoryChart(canvas,canvas.__bandixChart.originalLabels||[],canvas.__bandixChart.originalUpSeries||[],canvas.__bandixChart.originalDownSeries||[],zoomScale,zoomOffsetX);}}catch(e){}
return;}
var point=dataSource[idx];historyHover=true;historyHoverIndex=idx;try{drawHistoryChart(canvas,canvas.__bandixChart&&canvas.__bandixChart.originalLabels?canvas.__bandixChart.originalLabels:labels,canvas.__bandixChart&&canvas.__bandixChart.originalUpSeries?canvas.__bandixChart.originalUpSeries:upSeries,canvas.__bandixChart&&canvas.__bandixChart.originalDownSeries?canvas.__bandixChart.originalDownSeries:downSeries,zoomScale,zoomOffsetX);}catch(e){}
tooltip.innerHTML=buildTooltipHtml(point);tooltip.style.display='block';tooltip.style.left='-9999px';tooltip.style.top='-9999px';var tw=tooltip.offsetWidth||0;var th=tooltip.offsetHeight||0;var padding=20;var maxX=(typeof window!=='undefined'?window.innerWidth:document.documentElement.clientWidth)-4;var maxY=(typeof window!=='undefined'?window.innerHeight:document.documentElement.clientHeight)-4;var cx=evt.clientX;var cy=evt.clientY;var isMobileScreen=maxX<=768;var baseX,baseY;if(isMobileScreen){baseX=Math.max(4,Math.min(maxX-tw-4,cx-tw/2));baseY=cy+padding;if(baseY+th>maxY){baseY=cy-th-padding;}}else{baseX=cx+padding;baseY=cy-th-padding;if(baseX+tw>maxX){baseX=cx-tw-padding;}}
if(baseX<4)baseX=4;if(baseY<4)baseY=4;tooltip.style.left=baseX+'px';tooltip.style.top=baseY+'px';}
function onLeave(){if(tooltip)tooltip.style.display='none';historyHover=false;historyHoverIndex=null;if(zoomTimer){clearTimeout(zoomTimer);zoomTimer=null;}
zoomEnabled=false;zoomScale=1;zoomOffsetX=0;updateZoomLevelDisplay();if(canvas&&canvas.__bandixChart){delete canvas.__bandixChart.hoverIndex;}
try{drawHistoryChart(canvas,canvas.__bandixChart&&canvas.__bandixChart.originalLabels?canvas.__bandixChart.originalLabels:labels,canvas.__bandixChart&&canvas.__bandixChart.originalUpSeries?canvas.__bandixChart.originalUpSeries:upSeries,canvas.__bandixChart&&canvas.__bandixChart.originalDownSeries?canvas.__bandixChart.originalDownSeries:downSeries,1,0);}catch(e){}}
canvas.onmouseenter=function(){if(zoomTimer)clearTimeout(zoomTimer);zoomTimer=setTimeout(function(){zoomEnabled=true;zoomTimer=null;},1000);};canvas.onwheel=function(evt){if(!zoomEnabled)return;evt.preventDefault();var delta=evt.deltaY>0?0.9:1.1;var newScale=zoomScale*delta;if(newScale<1)newScale=1;if(newScale>10)newScale=10;var rect=canvas.getBoundingClientRect();var mouseX=evt.clientX-rect.left;var info=canvas.__bandixChart;if(!info||!info.originalLabels)return;var relativeX=(mouseX-info.padding.left)/info.innerW;var totalLen=info.originalLabels.length;var mouseDataIndex=relativeX*totalLen;var oldVisibleLen=totalLen/zoomScale;var newVisibleLen=totalLen/newScale;var centerShift=(oldVisibleLen-newVisibleLen)*(mouseDataIndex/totalLen);zoomScale=newScale;zoomOffsetX=Math.max(0,Math.min(totalLen-newVisibleLen,zoomOffsetX+centerShift));updateZoomLevelDisplay();try{drawHistoryChart(canvas,info.originalLabels,info.originalUpSeries,info.originalDownSeries,zoomScale,zoomOffsetX);if(typeof historyHoverIndex==='number'&&canvas.__bandixChart){canvas.__bandixChart.hoverIndex=historyHoverIndex;}}catch(e){}};var screenWidth=window.innerWidth||document.documentElement.clientWidth;var isMobileScreen=screenWidth<=768;if(!isMobileScreen){canvas.onmousemove=onMove;canvas.onmouseleave=onLeave;}else{if(tooltip){tooltip.style.display='none';}}}).catch(function(){var ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);drawHistoryChart(canvas,[],[],[],1,0);}).finally(function(){isHistoryLoading=false;});}
function initHistoryControls(){var typeSel=document.getElementById('history-type-select');var devSel=document.getElementById('history-device-select');if(typeSel)typeSel.value='total';updateZoomLevelDisplay();function onFilterChange(){refreshHistory();try{window.__bandixRenderTable&&window.__bandixRenderTable();}catch(e){}}
if(typeSel)typeSel.addEventListener('change',onFilterChange);if(devSel)devSel.addEventListener('change',onFilterChange);window.addEventListener('resize',function(){refreshHistory();});refreshHistory();}
setTimeout(initHistoryControls,0);poll.add(function(){return refreshHistory();},1);var expandedDeviceCards=new Set();var lanTrafficTooltipText=_('LAN Traffic is viewed from the entire subnet perspective, so upload and download are always equal, forming a closed loop. Additionally, due to the presence of dedicated hardware switching chips, LAN traffic between 2 devices (e.g., PC - NAS) within the local network may not be monitorable.');function updateDeviceData(){try{uci.unload('dhcp');}catch(e){}var devicePeriod=localStorage.getItem('bandix_device_period')||'all';if(!/^(today|week|month|year|all)$/.test(devicePeriod))devicePeriod='all';var timeRange=getTimeRangeForPeriod(devicePeriod);return Promise.all([(devicePeriod==='all')?callStatus():callStatus(timeRange.start_ms,timeRange.end_ms),fetchAllScheduleRules()]).then(function(results){var result=results[0];var trafficDiv=document.getElementById('traffic-status');var deviceCountDiv=document.getElementById('device-count');var statsGrid=document.getElementById('stats-grid');var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';var stats=result;if(!stats||!stats.d){if(trafficDiv){trafficDiv.innerHTML='<div class="error">'+_('Unable to fetch data')+'</div>';}
return;}
if(deviceCountDiv){var onlineCount=stats.d.filter(d=>isDeviceOnline(d)).length;deviceCountDiv.textContent=_('Online Devices')+': '+onlineCount+' / '+stats.d.length;}
var totalLanUp=stats.d.reduce((sum,d)=>sum+(d.l_tx_b||0),0);var totalLanDown=stats.d.reduce((sum,d)=>sum+(d.l_rx_b||0),0);var totalWanUp=stats.d.reduce((sum,d)=>sum+(d.w_tx_b||0),0);var totalWanDown=stats.d.reduce((sum,d)=>sum+(d.w_rx_b||0),0);var totalLanSpeedUp=stats.d.reduce((sum,d)=>sum+(d.l_tx_r||0),0);var totalLanSpeedDown=stats.d.reduce((sum,d)=>sum+(d.l_rx_r||0),0);var totalWanSpeedUp=stats.d.reduce((sum,d)=>sum+(d.w_tx_r||0),0);var totalWanSpeedDown=stats.d.reduce((sum,d)=>sum+(d.w_rx_r||0),0);var totalSpeedUp=totalLanSpeedUp+totalWanSpeedUp;var totalSpeedDown=totalLanSpeedDown+totalWanSpeedDown;var totalUp=totalLanUp+totalWanUp;var totalDown=totalLanDown+totalWanDown;statsGrid.innerHTML='';var lanTrafficCard=E('div',{'class':'cbi-section','id':'lan-traffic-card'},[E('div',{'class':'stats-card-title'},[E('span',{},_('LAN Traffic')),E('span',{'class':'stats-card-info-icon'},'?')]),E('div',{'style':'display: flex; flex-direction: column; gap: 8px;'},[E('div',{'style':'display: flex; align-items: center; gap: 4px;'},[E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↑'),E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 1.125rem; font-weight: 700;'},formatByterate(totalLanSpeedUp,speedUnit)),E('span',{'style':'font-size: 0.75rem; color: #64748b; margin-left: 4px;'},'('+formatSize(totalLanUp)+')')]),E('div',{'style':'display: flex; align-items: center; gap: 4px;'},[E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↓'),E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 1.125rem; font-weight: 700;'},formatByterate(totalLanSpeedDown,speedUnit)),E('span',{'style':'font-size: 0.75rem; color: #64748b; margin-left: 4px;'},'('+formatSize(totalLanDown)+')')])])]);statsGrid.appendChild(lanTrafficCard);setTimeout(function(){var lanTrafficCardEl=document.getElementById('lan-traffic-card');var tooltip=document.getElementById('lan-traffic-tooltip');if(lanTrafficCardEl&&tooltip){var isMobile=window.innerWidth<=768;if(isMobile)return;var tooltipTextSet=false;function updateTooltipPosition(e){if(!tooltipTextSet){tooltip.textContent=lanTrafficTooltipText;tooltipTextSet=true;}
tooltip.style.display='block';tooltip.style.left='-9999px';tooltip.style.top='-9999px';var tw=tooltip.offsetWidth||0;var th=tooltip.offsetHeight||0;var tooltipX=e.clientX+15;var tooltipY=e.clientY-th-15;if(tooltipY<0){tooltipY=e.clientY+15;}
if(tooltipX+tw>window.innerWidth){tooltipX=e.clientX-tw-15;}
if(tooltipX<0){tooltipX=10;}
if(tooltipY+th>window.innerHeight){tooltipY=window.innerHeight-th-10;}
tooltip.style.left=tooltipX+'px';tooltip.style.top=tooltipY+'px';}
lanTrafficCardEl.addEventListener('mouseenter',function(e){updateTooltipPosition(e);});lanTrafficCardEl.addEventListener('mouseleave',function(){tooltip.style.display='none';});lanTrafficCardEl.addEventListener('mousemove',function(e){updateTooltipPosition(e);});lanTrafficCardEl.addEventListener('wheel',function(){tooltip.style.display='none';});}},100);statsGrid.appendChild(E('div',{'class':'cbi-section'},[E('div',{'class':'stats-card-title'},_('WAN Traffic')),E('div',{'style':'display: flex; flex-direction: column; gap: 8px;'},[E('div',{'style':'display: flex; align-items: center; gap: 4px;'},[E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↑'),E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 1.125rem; font-weight: 700;'},formatByterate(totalWanSpeedUp,speedUnit)),E('span',{'style':'font-size: 0.75rem; color: #64748b; margin-left: 4px;'},'('+formatSize(totalWanUp)+')')]),E('div',{'style':'display: flex; align-items: center; gap: 4px;'},[E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↓'),E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 1.125rem; font-weight: 700;'},formatByterate(totalWanSpeedDown,speedUnit)),E('span',{'style':'font-size: 0.75rem; color: #64748b; margin-left: 4px;'},'('+formatSize(totalWanDown)+')')])])]));statsGrid.appendChild(E('div',{'class':'cbi-section'},[E('div',{'class':'stats-card-title'},_('Total')),E('div',{'style':'display: flex; flex-direction: column; gap: 8px;'},[E('div',{'style':'display: flex; align-items: center; gap: 4px;'},[E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↑'),E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 1.125rem; font-weight: 700;'},formatByterate(totalSpeedUp,speedUnit)),E('span',{'style':'font-size: 0.75rem; color: #64748b; margin-left: 4px;'},'('+formatSize(totalUp)+')')]),E('div',{'style':'display: flex; align-items: center; gap: 4px;'},[E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↓'),E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 1.125rem; font-weight: 700;'},formatByterate(totalSpeedDown,speedUnit)),E('span',{'style':'font-size: 0.75rem; color: #64748b; margin-left: 4px;'},'('+formatSize(totalDown)+')')])])]));function createSortableHeader(text,sortKey){var th=E('th',{'class':'sortable'+(currentSortBy===sortKey?' active '+(currentSortOrder?'asc':'desc'):''),'data-sort':sortKey},text);th.addEventListener('click',function(){var newSortBy=this.getAttribute('data-sort');if(currentSortBy===newSortBy){currentSortOrder=!currentSortOrder;}else{currentSortBy=newSortBy;currentSortOrder=false;}
localStorage.setItem('bandix_sort_by',currentSortBy);localStorage.setItem('bandix_sort_order',currentSortOrder.toString());if(window.__bandixRenderTable){window.__bandixRenderTable();}});return th;}
function createSplitHeader(text,speedKey,trafficKey){var th=E('th',{});var header=E('div',{'class':'th-split-header'},[E('span',{},text)]);var controls=E('div',{'style':'display: flex; align-items: center; gap: 4px;'});var speedBtn=E('div',{'class':'th-split-section'+(currentSortBy===speedKey?' active':''),'data-sort':speedKey,'title':_('Sort by Speed')},[E('span',{'class':'th-split-icon'},'⚡'),E('span',{'style':'font-size: 0.75rem;'},currentSortBy===speedKey?(currentSortOrder?'↑':'↓'):'')]);var divider=E('div',{'class':'th-split-divider'});var trafficBtn=E('div',{'class':'th-split-section'+(currentSortBy===trafficKey?' active':''),'data-sort':trafficKey,'title':_('Sort by Traffic')},[E('span',{'class':'th-split-icon'},'∑'),E('span',{'style':'font-size: 0.75rem;'},currentSortBy===trafficKey?(currentSortOrder?'↑':'↓'):'')]);controls.appendChild(speedBtn);controls.appendChild(divider);controls.appendChild(trafficBtn);header.appendChild(controls);th.appendChild(header);speedBtn.addEventListener('click',function(e){e.stopPropagation();var newSortBy=this.getAttribute('data-sort');if(currentSortBy===newSortBy){currentSortOrder=!currentSortOrder;}else{currentSortBy=newSortBy;currentSortOrder=false;}
localStorage.setItem('bandix_sort_by',currentSortBy);localStorage.setItem('bandix_sort_order',currentSortOrder.toString());if(window.__bandixRenderTable){window.__bandixRenderTable();}});trafficBtn.addEventListener('click',function(e){e.stopPropagation();var newSortBy=this.getAttribute('data-sort');if(currentSortBy===newSortBy){currentSortOrder=!currentSortOrder;}else{currentSortBy=newSortBy;currentSortOrder=false;}
localStorage.setItem('bandix_sort_by',currentSortBy);localStorage.setItem('bandix_sort_order',currentSortOrder.toString());if(window.__bandixRenderTable){window.__bandixRenderTable();}});return th;}
var table=E('table',{'class':'bandix-table'},[E('thead',{},[E('tr',{},[createSortableHeader(_('Device Info'),'online'),createSplitHeader(_('LAN Traffic'),'lan_speed','lan_traffic'),createSplitHeader(_('WAN Traffic'),'wan_speed','wan_traffic'),E('th',{},_('Schedule Rules')),E('th',{},_('Actions'))])]),E('tbody',{})]);var tbody=table.querySelector('tbody');var cardsContainer=E('div',{'class':'device-list-cards'});var selectedMac=(typeof document!=='undefined'?(document.getElementById('history-device-select')?.value||''):'');var filteredDevices=(!selectedMac)?stats.d:stats.d.filter(function(d){return(d.mac===selectedMac);});filteredDevices=sortDevices(filteredDevices,currentSortBy,currentSortOrder);var hasAnyIPv6=filteredDevices.some(function(device){var lanIPv6=filterLanIPv6(device.ip6);return lanIPv6.length>0;});filteredDevices.forEach(function(device){var isOnline=isDeviceOnline(device);var buttonText='⚙';var actionButton=E('button',{'class':'cbi-button cbi-button-action','title':_('Settings')},buttonText);actionButton.addEventListener('click',function(){showRateLimitModal(device);});var deleteButton=E('button',{'class':'cbi-button cbi-button-reset','title':_('Delete Device')},'\u2715');deleteButton.addEventListener('click',function(e){e.stopPropagation();showConfirmDialog(_('Delete Device'),_('Are you sure you want to delete this device? Traffic history will be removed.'),function(){callDeleteDevice(device.mac).then(function(){updateDeviceData();}).catch(function(err){ui.addNotification(null,E('p',{},_('Failed to delete device')),'error');});});});var screenWidth=window.innerWidth||document.documentElement.clientWidth;var isMobileScreen=screenWidth<=768;var deviceMode=isMobileScreen?'simple':(localStorage.getItem('bandix_device_mode')||'simple');var isDetailedMode=deviceMode==='detailed';var uplinkChBadges=buildDeviceUplinkChBadges(device);var deviceInfoElements=[E('div',{'class':'device-name'},[E('span',{'class':'device-status '+(isOnline?'online':'offline')}),device.host||'-']),E('div',{'class':'device-ip'},[device.conn?E('span',{'class':'device-connection-type','title':device.conn==='wifi'?_('Wireless'):(device.conn==='router'?_('Router'):_('Wired'))},getConnectionTypeIcon(device.conn)):'',device.ip4,uplinkChBadges.length?E('span',{'class':'device-uplink-badges'},uplinkChBadges):''])];if(isDetailedMode){if(hasAnyIPv6){var lanIPv6=filterLanIPv6(device.ip6);if(lanIPv6.length>0){var allIPv6=device.ip6?device.ip6.join(', '):'';deviceInfoElements.push(E('div',{'class':'device-ipv6','title':allIPv6},lanIPv6.join(', ')));}else{deviceInfoElements.push(E('div',{'class':'device-ipv6'},'-'));}}
deviceInfoElements.push(E('div',{'class':'device-mac'},device.mac),E('div',{'class':'device-last-online'},[E('span',{},_('Last Online')+': '),E('span',{'class':'device-last-online-value'},formatLastOnlineTime(device.last)),E('span',{'class':'device-last-online-exact'},formatLastOnlineExactTime(device.last))]));}
var row=E('tr',{},[E('td',{},[E('div',{'class':'device-info'},deviceInfoElements)]),E('td',{},[E('div',{'class':'traffic-info'},[E('div',{'class':'traffic-row'},[E('span',{'class':'traffic-icon upload'},'↑'),E('span',{'class':'traffic-speed lan'},formatByterate(device.l_tx_r||0,speedUnit)),E('span',{'class':'traffic-total'},'('+formatSize(device.l_tx_b||0)+')')]),E('div',{'class':'traffic-row'},[E('span',{'class':'traffic-icon download'},'↓'),E('span',{'class':'traffic-speed lan'},formatByterate(device.l_rx_r||0,speedUnit)),E('span',{'class':'traffic-total'},'('+formatSize(device.l_rx_b||0)+')')])])]),E('td',{},[E('div',{'class':'traffic-info'},[E('div',{'class':'traffic-row'},[E('span',{'class':'traffic-icon upload'},'↑'),E('span',{'class':'traffic-speed wan'},formatByterate(device.w_tx_r||0,speedUnit)),E('span',{'class':'traffic-total'},'('+formatSize(device.w_tx_b||0)+')')]),E('div',{'class':'traffic-row'},[E('span',{'class':'traffic-icon download'},'↓'),E('span',{'class':'traffic-speed wan'},formatByterate(device.w_rx_r||0,speedUnit)),E('span',{'class':'traffic-total'},'('+formatSize(device.w_rx_b||0)+')')])])]),(function(){var activeRules=getActiveRulesForDevice(device.mac);var allDeviceRules=allScheduleRules.filter(function(r){return r&&r.mac===device.mac;});var rulesInfo=E('div',{'class':'schedule-rules-info'},[]);if(allDeviceRules.length===0){rulesInfo.appendChild(E('div',{'style':'font-size: 0.75rem; opacity: 0.6;'},'-'));}else{rulesInfo.appendChild(E('div',{'style':'font-size: 0.75rem; font-weight: 600; margin-bottom: 4px;'},allDeviceRules.length+' '+(allDeviceRules.length===1?_('rule'):_('rules'))));if(activeRules.length>0){var mergedLimits=mergeActiveRulesLimits(activeRules);var uploadLimit=mergedLimits.uploadLimit;var downloadLimit=mergedLimits.downloadLimit;var limitsContainer=E('div',{'style':'font-size: 0.75rem; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;'});var uploadSpan=E('span',{});uploadSpan.appendChild(E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+';'},'↑'));uploadSpan.appendChild(document.createTextNode(uploadLimit>0?formatByterate(uploadLimit,speedUnit):_('Unlimited')));limitsContainer.appendChild(uploadSpan);var downloadSpan=E('span',{});downloadSpan.appendChild(E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+';'},'↓'));downloadSpan.appendChild(document.createTextNode(downloadLimit>0?formatByterate(downloadLimit,speedUnit):_('Unlimited')));limitsContainer.appendChild(downloadSpan);rulesInfo.appendChild(limitsContainer);}else{rulesInfo.appendChild(E('div',{'style':'font-size: 0.75rem; opacity: 0.5;'},_('No active rule')));}}
var screenWidth=window.innerWidth||document.documentElement.clientWidth;if(screenWidth>768&&allDeviceRules.length>0){rulesInfo.onmouseenter=function(evt){var tooltip=document.getElementById('schedule-rules-tooltip');if(!tooltip)return;var html=buildScheduleRulesTooltipHtml(allDeviceRules,activeRules,speedUnit);if(!html)return;tooltip.innerHTML=html;tooltip.style.display='block';tooltip.style.visibility='hidden';tooltip.style.left='-9999px';tooltip.style.top='-9999px';var tw=tooltip.offsetWidth||0;var th=tooltip.offsetHeight||0;if(tw===0||th===0){tooltip.style.display='none';return;}
tooltip.style.visibility='visible';var padding=12;var maxX=window.innerWidth-4;var maxY=window.innerHeight-4;var rect=evt.currentTarget.getBoundingClientRect();var cx=rect.left+rect.width/2;var cy=rect.top+rect.height/2;var baseX=cx+padding;var baseY=cy-th/2;if(baseX+tw>maxX){baseX=cx-tw-padding;}
if(baseY<4)baseY=4;if(baseY+th>maxY)baseY=maxY-th-4;tooltip.style.left=baseX+'px';tooltip.style.top=baseY+'px';};rulesInfo.onmouseleave=function(){var tooltip=document.getElementById('schedule-rules-tooltip');if(tooltip){tooltip.style.display='none';tooltip.style.visibility='visible';}};rulesInfo.onmousemove=function(evt){var tooltip=document.getElementById('schedule-rules-tooltip');if(!tooltip||tooltip.style.display==='none')return;var tw=tooltip.offsetWidth||0;var th=tooltip.offsetHeight||0;var padding=12;var maxX=window.innerWidth-4;var maxY=window.innerHeight-4;var rect=evt.currentTarget.getBoundingClientRect();var cx=rect.left+rect.width/2;var cy=rect.top+rect.height/2;var baseX=cx+padding;var baseY=cy-th/2;if(baseX+tw>maxX){baseX=cx-tw-padding;}
if(baseY<4)baseY=4;if(baseY+th>maxY)baseY=maxY-th-4;tooltip.style.left=baseX+'px';tooltip.style.top=baseY+'px';};}
return E('td',{},rulesInfo);})(),E('td',{'class':'device-actions'},[actionButton,deleteButton])]);tbody.appendChild(row);var card=E('div',{'class':'device-card'},[E('div',{'class':'device-card-header'},[E('div',{'class':'device-card-name'},[E('span',{'class':'device-status '+(isOnline?'online':'offline')}),E('div',{},[E('div',{'style':'font-weight: 600;'},device.host||'-'),E('div',{'class':'device-card-ip'},[device.conn?E('span',{'class':'device-connection-type','title':device.conn==='wifi'?_('Wireless'):(device.conn==='router'?_('Router'):_('Wired'))},getConnectionTypeIcon(device.conn)):'',device.ip4,(function(){var badges=buildDeviceUplinkChBadges(device);return badges.length?E('span',{'class':'device-uplink-badges'},badges):'';})()])])]),E('div',{'class':'device-card-action'},[(function(){var cardActionBtn=E('button',{'class':'cbi-button cbi-button-action','title':_('Settings')},buttonText);cardActionBtn.addEventListener('click',function(){showRateLimitModal(device);});return cardActionBtn;})(),(function(){var cardDeleteBtn=E('button',{'class':'cbi-button cbi-button-reset','title':_('Delete Device')},'\u2715');cardDeleteBtn.addEventListener('click',function(e){e.stopPropagation();showConfirmDialog(_('Delete Device'),_('Are you sure you want to delete this device? Traffic history will be removed.'),function(){callDeleteDevice(device.mac).then(function(){updateDeviceData();}).catch(function(err){ui.addNotification(null,E('p',{},_('Failed to delete device')),'error');});});});return cardDeleteBtn;})()])]),E('div',{'class':'device-card-content'},[E('div',{'class':'device-card-section'},[E('div',{'class':'device-card-section-label'},_('WAN Traffic')),E('div',{'class':'device-card-traffic'},[E('div',{'class':'device-card-traffic-row'},[E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↑'),E('span',{'style':'font-weight: 600;'},formatByterate(device.w_tx_r||0,speedUnit)),E('span',{'style':'font-size: 0.75rem; opacity: 0.7;'},'('+formatSize(device.w_tx_b||0)+')')]),E('div',{'class':'device-card-traffic-row'},[E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↓'),E('span',{'style':'font-weight: 600;'},formatByterate(device.w_rx_r||0,speedUnit)),E('span',{'style':'font-size: 0.75rem; opacity: 0.7;'},'('+formatSize(device.w_rx_b||0)+')')])])])]),(function(){var activeRules=getActiveRulesForDevice(device.mac);var allDeviceRules=allScheduleRules.filter(function(r){return r&&r.mac===device.mac;});if(allDeviceRules.length===0){return E('div',{'class':'device-card-section device-card-rules'},[E('div',{'class':'device-card-section-label'},_('Schedule Rules')),E('div',{'class':'device-card-rules-empty'},'-')]);}
var rulesContent=E('div',{'class':'device-card-rules-content'});rulesContent.appendChild(E('div',{'class':'device-card-rules-count'},allDeviceRules.length+' '+(allDeviceRules.length===1?_('rule'):_('rules'))));if(activeRules.length>0){var mergedLimits=mergeActiveRulesLimits(activeRules);var uploadLimit=mergedLimits.uploadLimit;var downloadLimit=mergedLimits.downloadLimit;var limitsText=[];limitsText.push('↑'+(uploadLimit>0?formatByterate(uploadLimit,speedUnit):_('Unlimited')));limitsText.push('↓'+(downloadLimit>0?formatByterate(downloadLimit,speedUnit):_('Unlimited')));rulesContent.appendChild(E('div',{'class':'device-card-rules-active-time'},limitsText.join(' ')));}else{rulesContent.appendChild(E('div',{'class':'device-card-rules-inactive'},_('No active rule')));}
return E('div',{'class':'device-card-section device-card-rules'},[E('div',{'class':'device-card-section-label'},_('Schedule Rules')),rulesContent]);})(),E('div',{'class':'device-card-section','style':'margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0, 0, 0, 0.1);'},[E('div',{'class':'device-card-section-label'},_('LAN Traffic')),E('div',{'class':'device-card-traffic'},[E('div',{'class':'device-card-traffic-row'},[E('span',{'style':'color: '+BANDIX_COLOR_UPLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↑'),E('span',{'style':'font-weight: 600;'},formatByterate(device.l_tx_r||0,speedUnit)),E('span',{'style':'font-size: 0.75rem; opacity: 0.7;'},'('+formatSize(device.l_tx_b||0)+')')]),E('div',{'class':'device-card-traffic-row'},[E('span',{'style':'color: '+BANDIX_COLOR_DOWNLOAD+'; font-size: 0.75rem; font-weight: bold;'},'↓'),E('span',{'style':'font-weight: 600;'},formatByterate(device.l_rx_r||0,speedUnit)),E('span',{'style':'font-size: 0.75rem; opacity: 0.7;'},'('+formatSize(device.l_rx_b||0)+')')])])])]);cardsContainer.appendChild(card);});trafficDiv.innerHTML='';trafficDiv.appendChild(table);trafficDiv.appendChild(cardsContainer);try{window.__bandixRenderTable=function(){updateDeviceData();};}catch(e){}
try{latestDevices=stats.d||[];updateDeviceOptions(latestDevices);}catch(e){}});}
var usageRankingShowAll=false;var usageRankingData=[];var USAGE_RANKING_DEFAULT_LIMIT=10;var usageRankingCustomRange=null;var trafficIncrementsCustomRange=null;function formatTimeRange(startMs,endMs){if(!startMs||!endMs)return'';var startDate=new Date(startMs);var endDate=new Date(endMs);var formatDateTime=function(date){var year=date.getFullYear();var month=(date.getMonth()+1).toString().padStart(2,'0');var day=date.getDate().toString().padStart(2,'0');var hours=date.getHours().toString().padStart(2,'0');var minutes=date.getMinutes().toString().padStart(2,'0');return year+'/'+month+'/'+day+' '+hours+':'+minutes;};return formatDateTime(startDate)+' - '+formatDateTime(endDate);}
function renderUsageRanking(data,showAll){if(Array.isArray(data)){data.forEach(function(item){if(item){var cmt=L.getDHCPCommentUniversal(item.mac,item.ip4,item.host);if(cmt)item.host=cmt;}});}var container=document.getElementById('usage-ranking-container');if(!container)return;if(data.length===0){container.innerHTML='<div class="loading-state">'+_('No data')+'</div>';return;}
var displayData=showAll?data:data.slice(0,USAGE_RANKING_DEFAULT_LIMIT);var rankingList=E('div',{'class':'usage-ranking-list'});displayData.forEach(function(item){var rankingItem=E('div',{'class':'usage-ranking-item','style':'--progress-width: '+(item.pct||0)+'%;'},[E('div',{'class':'usage-ranking-rank'},(item.r||'-')),E('div',{'class':'usage-ranking-info'},[E('div',{'class':'usage-ranking-device'},[E('div',{'class':'usage-ranking-name'},item.host||item.ip4||item.mac||'-'),E('div',{'class':'usage-ranking-meta'},[E('span',{},item.ip4||'-'),E('span',{},item.mac||'-'),E('span',{'class':'usage-ranking-meta-total'},formatSize(item.t_b||0))])]),E('div',{'class':'usage-ranking-stats'},[E('div',{'class':'usage-ranking-traffic'},[E('span',{'class':'usage-ranking-traffic-item tx'},[E('span',{'class':'usage-ranking-traffic-arrow'},'↑'),E('span',{},formatSize(item.tx_b||0))]),E('span',{'class':'usage-ranking-traffic-item rx'},[E('span',{'class':'usage-ranking-traffic-arrow'},'↓'),E('span',{},formatSize(item.rx_b||0))]),E('span',{'class':'usage-ranking-traffic-item total'},[E('span',{},formatSize(item.t_b||0))])]),E('div',{'class':'usage-ranking-percentage'},(item.pct||0).toFixed(1)+'%')])])]);rankingList.appendChild(rankingItem);});container.innerHTML='';container.appendChild(rankingList);if(data.length>USAGE_RANKING_DEFAULT_LIMIT){var toggleBtn=E('button',{'class':'usage-ranking-toggle-btn'},showAll?_('Show Top %d').format(USAGE_RANKING_DEFAULT_LIMIT):_('Show All'));toggleBtn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();usageRankingShowAll=!usageRankingShowAll;renderUsageRanking(usageRankingData,usageRankingShowAll);});var controls=E('div',{'class':'usage-ranking-controls'},[E('span',{'class':'usage-ranking-info-text'},showAll?_('Showing all %d devices').format(data.length):_('Showing top %d of %d devices').format(displayData.length,data.length)),toggleBtn]);container.appendChild(controls);}}
function updateTrafficStatistics(customRange,callback){var startMs=null;var endMs=null;var networkTypeSelect=document.getElementById('usage-ranking-network-type');var networkType=networkTypeSelect?networkTypeSelect.value:'wan';if(customRange&&customRange.start_ms&&customRange.end_ms){startMs=customRange.start_ms;endMs=customRange.end_ms;console.log('Querying with custom range:',{start_ms:startMs,end_ms:endMs,network_type:networkType});}else{console.log('Querying with default range (no params), network_type:',networkType);}
callGetTrafficUsageRanking(startMs,endMs,networkType).then(function(result){console.log('Query result:',result);if(!result||!result.r){return;}
usageRankingData=result.r;var timeRangeEl=document.getElementById('usage-ranking-timerange');if(timeRangeEl&&result.start&&result.end){var timeRangeText=formatTimeRange(result.start,result.end);var parts=[];if(result.t_tx_b!==undefined&&result.t_tx_b!==null){parts.push('↑'+formatSize(result.t_tx_b));}
if(result.t_rx_b!==undefined&&result.t_rx_b!==null){parts.push('↓'+formatSize(result.t_rx_b));}
if(result.t_b!==undefined&&result.t_b!==null){parts.push(formatSize(result.t_b));}
if(parts.length>0){timeRangeText+=' · '+parts.join(' · ');}
timeRangeEl.textContent=timeRangeText;}
if(typeof latestDevices!=='undefined'&&latestDevices.length>0){updateDeviceSelectForIncrements(latestDevices);}else{callStatus().then(function(deviceResult){if(deviceResult&&deviceResult.d){latestDevices=deviceResult.d;updateDeviceSelectForIncrements(latestDevices);}}).catch(function(err){console.error('Failed to load device list for timeline:',err);});}
renderUsageRanking(usageRankingData,usageRankingShowAll);if(callback)callback();}).catch(function(err){console.error('Failed to load usage ranking:',err);var container=document.getElementById('usage-ranking-container');if(container){container.innerHTML='<div class="error-state">'+_('Failed to load data')+'</div>';}
if(callback)callback();});}
function normalizeTrafficIncrementItem(item){if(!item)return null;var tsMs=item.ts_ms;if(!tsMs&&item.start)tsMs=item.start;if(!tsMs&&item.end)tsMs=item.end;var rxBytes=(item.rx_bytes!==undefined&&item.rx_bytes!==null)?item.rx_bytes:null;var txBytes=(item.tx_bytes!==undefined&&item.tx_bytes!==null)?item.tx_bytes:null;var totalBytes=(item.total_bytes!==undefined&&item.total_bytes!==null)?item.total_bytes:null;if(rxBytes===null){rxBytes=(item.w_rx_b||0)+(item.l_rx_b||0);}
if(txBytes===null){txBytes=(item.w_tx_b||0)+(item.l_tx_b||0);}
if(totalBytes===null){totalBytes=rxBytes+txBytes;}
return Object.assign({},item,{ts_ms:tsMs||0,rx_bytes:rxBytes||0,tx_bytes:txBytes||0,total_bytes:totalBytes||0});}
function normalizeTrafficIncrementsList(increments){if(!Array.isArray(increments))return[];return increments.map(normalizeTrafficIncrementItem).filter(function(x){return x;});}
var TRAFFIC_INCREMENT_CHUNK_MS_HOURLY=14*24*60*60*1000;var TRAFFIC_INCREMENT_CHUNK_MS_DAILY=60*24*60*60*1000;function mergeIncrementsResponse(base,part){if(!part)return base;if(Array.isArray(part.inc)){base.inc=base.inc.concat(part.inc);}
if(part.start&&(!base.start||part.start<base.start)){base.start=part.start;}
if(part.end&&(!base.end||part.end>base.end)){base.end=part.end;}
base.t_rx_b=(base.t_rx_b||0)+(part.t_rx_b||0);base.t_tx_b=(base.t_tx_b||0)+(part.t_tx_b||0);base.t_b=(base.t_b||0)+(part.t_b||0);if(!base.agg&&part.agg)base.agg=part.agg;if(!base.mac&&part.mac)base.mac=part.mac;if(!base.net&&part.net)base.net=part.net;if(!base.network_type&&part.network_type)base.network_type=part.network_type;return base;}
function buildTrafficIncrementsChunks(startMs,endMs,aggregation){if(!startMs||!endMs||endMs<=startMs){return null;}
var chunkMs=aggregation==='daily'?TRAFFIC_INCREMENT_CHUNK_MS_DAILY:TRAFFIC_INCREMENT_CHUNK_MS_HOURLY;var totalRange=endMs-startMs;if(totalRange<=chunkMs){return null;}
var chunks=[];for(var s=startMs;s<endMs;s+=chunkMs){chunks.push({start:s,end:Math.min(s+chunkMs,endMs)});}
return chunks;}
function fetchTrafficIncrementsChunked(startMs,endMs,aggregation,mac,networkType,onProgress){var chunks=buildTrafficIncrementsChunks(startMs,endMs,aggregation);if(!chunks){return callGetTrafficUsageIncrements(startMs,endMs,aggregation,mac,networkType);}
if(typeof onProgress==='function'){onProgress(0,chunks.length);}
var merged={start:startMs,end:endMs,agg:aggregation,inc:[],t_rx_b:0,t_tx_b:0,t_b:0};var chain=Promise.resolve(merged);var finished=0;chunks.forEach(function(chunk){chain=chain.then(function(acc){return callGetTrafficUsageIncrements(chunk.start,chunk.end,aggregation,mac,networkType).then(function(part){finished+=1;if(typeof onProgress==='function'){onProgress(finished,chunks.length);}
return mergeIncrementsResponse(acc,part||{});});});});return chain.then(function(result){if(Array.isArray(result.inc)){result.inc.sort(function(a,b){var aTs=(a&&(a.start||a.ts_ms||a.end))||0;var bTs=(b&&(b.start||b.ts_ms||b.end))||0;return aTs-bTs;});}
return result;});}
var incrementsZoomEnabled=false;var incrementsZoomScale=1;var incrementsZoomOffsetX=0;var incrementsZoomTimer=null;function updateTrafficIncrements(startMs,endMs,aggregation,mac,callback){if(!startMs||!endMs){if(trafficIncrementsCustomRange){startMs=trafficIncrementsCustomRange.start_ms;endMs=trafficIncrementsCustomRange.end_ms;}}
var aggregationSelect=document.getElementById('traffic-increments-aggregation');var macSelect=document.getElementById('traffic-increments-mac');var networkTypeSelect=document.getElementById('traffic-increments-network-type');var selectedAggregation=aggregation||(aggregationSelect?aggregationSelect.value:'hourly');var selectedMac=mac||(macSelect?macSelect.value:'all');var selectedNetworkType=networkTypeSelect?networkTypeSelect.value:'all';if(selectedMac==='all'){selectedMac=null;}
if(!selectedNetworkType){selectedNetworkType=null;}
var container=document.getElementById('traffic-increments-container');var chunks=buildTrafficIncrementsChunks(startMs,endMs,selectedAggregation);if(container){if(chunks&&chunks.length>1){container.innerHTML='<div class="loading-state">'+_('Loading in chunks, please wait... (%d/%d)').format(0,chunks.length)+'</div>';}else{container.innerHTML='<div class="loading-state">'+_('Loading...')+'</div>';}}
fetchTrafficIncrementsChunked(startMs,endMs,selectedAggregation,selectedMac,selectedNetworkType,function(done,total){var progressContainer=document.getElementById('traffic-increments-container');if(progressContainer&&total>1){progressContainer.innerHTML='<div class="loading-state">'+_('Loading in chunks, please wait... (%d/%d)').format(done,total)+'</div>';}}).then(function(result){if(!result||!result.inc){var container=document.getElementById('traffic-increments-container');if(container){container.innerHTML='<div class="loading-state">'+_('No data')+'</div>';}
if(callback)callback();return;}
var normalizedIncrements=normalizeTrafficIncrementsList(result.inc);var timeRangeEl=document.getElementById('traffic-increments-timerange');if(timeRangeEl&&result.start&&result.end){var timeRangeText=formatTimeRange(result.start,result.end);var parts=[];if(result.t_tx_b!==undefined&&result.t_tx_b!==null){parts.push('↑'+formatSize(result.t_tx_b));}
if(result.t_rx_b!==undefined&&result.t_rx_b!==null){parts.push('↓'+formatSize(result.t_rx_b));}
if(result.t_b!==undefined&&result.t_b!==null){parts.push(formatSize(result.t_b));}
if(parts.length>0){timeRangeText+=' · '+parts.join(' · ');}
timeRangeEl.textContent=timeRangeText;}
var container=document.getElementById('traffic-increments-container');if(!container){if(callback)callback();return;}
if(normalizedIncrements.length===0){container.innerHTML='<div class="loading-state">'+_('No data')+'</div>';if(callback)callback();return;}
var chartContainer=E('div',{'class':'traffic-increments-chart'});var canvas=E('canvas',{'id':'traffic-increments-chart-canvas'});var tooltip=E('div',{'class':'traffic-increments-tooltip','id':'traffic-increments-tooltip'});chartContainer.appendChild(canvas);chartContainer.appendChild(tooltip);var legend=E('div',{'class':'traffic-stats-legend'},[E('div',{'class':'traffic-stats-legend-item'},[E('span',{'class':'traffic-stats-legend-dot tx'}),E('span',{},_('Upload'))]),E('div',{'class':'traffic-stats-legend-item'},[E('span',{'class':'traffic-stats-legend-dot rx'}),E('span',{},_('Download'))])]);var summary=E('div',{'class':'traffic-increments-summary'},[E('div',{'class':'traffic-increments-summary-item'},[E('div',{'class':'traffic-increments-summary-label'},_('Total Upload')),E('div',{'class':'traffic-increments-summary-value'},formatSize(result.t_tx_b||0))]),E('div',{'class':'traffic-increments-summary-item'},[E('div',{'class':'traffic-increments-summary-label'},_('Total Download')),E('div',{'class':'traffic-increments-summary-value'},formatSize(result.t_rx_b||0))]),E('div',{'class':'traffic-increments-summary-item'},[E('div',{'class':'traffic-increments-summary-label'},_('Total')),E('div',{'class':'traffic-increments-summary-value'},formatSize(result.t_b||0))])]);container.innerHTML='';container.appendChild(chartContainer);container.appendChild(legend);container.appendChild(summary);setTimeout(function(){var aggregation=result.agg||'hourly';if(incrementsZoomTimer){clearTimeout(incrementsZoomTimer);incrementsZoomTimer=null;}
incrementsZoomEnabled=false;incrementsZoomScale=1;incrementsZoomOffsetX=0;drawIncrementsChart(canvas,normalizedIncrements,aggregation,incrementsZoomScale,incrementsZoomOffsetX);setupChartTooltip(canvas,tooltip,normalizedIncrements,aggregation,selectedNetworkType);canvas.onmouseenter=function(){if(incrementsZoomTimer)clearTimeout(incrementsZoomTimer);incrementsZoomTimer=setTimeout(function(){incrementsZoomEnabled=true;incrementsZoomTimer=null;},1000);};canvas.onmouseleave=function(){if(incrementsZoomTimer){clearTimeout(incrementsZoomTimer);incrementsZoomTimer=null;}
incrementsZoomEnabled=false;incrementsZoomScale=1;incrementsZoomOffsetX=0;drawIncrementsChart(canvas,normalizedIncrements,aggregation,incrementsZoomScale,incrementsZoomOffsetX);};canvas.onwheel=function(evt){if(!incrementsZoomEnabled)return;evt.preventDefault();var delta=evt.deltaY>0?0.9:1.1;var newScale=incrementsZoomScale*delta;if(newScale<1)newScale=1;if(newScale>10)newScale=10;var rect=canvas.getBoundingClientRect();var mouseX=evt.clientX-rect.left;var info=canvas.__bandixIncrements;if(!info||!info.originalIncrements)return;var padding={top:20,right:20,bottom:40,left:80};var chartWidth=rect.width-padding.left-padding.right;var relativeX=(mouseX-padding.left)/chartWidth;var totalLen=info.originalIncrements.length;var mouseDataIndex=relativeX*totalLen;var oldVisibleLen=totalLen/incrementsZoomScale;var newVisibleLen=totalLen/newScale;var centerShift=(oldVisibleLen-newVisibleLen)*(mouseDataIndex/totalLen);incrementsZoomScale=newScale;incrementsZoomOffsetX=Math.max(0,Math.min(totalLen-newVisibleLen,incrementsZoomOffsetX+centerShift));try{drawIncrementsChart(canvas,info.originalIncrements,aggregation,incrementsZoomScale,incrementsZoomOffsetX);setupChartTooltip(canvas,tooltip,info.originalIncrements,aggregation,selectedNetworkType);}catch(e){console.error('Zoom error:',e);}};if(callback)callback();},100);}).catch(function(err){console.error('Failed to load traffic increments:',err);var container=document.getElementById('traffic-increments-container');if(container){container.innerHTML='<div class="error-state">'+_('Failed to load data')+'</div>';}
if(callback)callback();});}
function updateDeviceSelectForIncrements(devices){var macSelect=document.getElementById('traffic-increments-mac');if(!macSelect)return;var currentValue=macSelect.value;macSelect.innerHTML='';macSelect.appendChild(E('option',{'value':'all'},_('All Devices')));var sortedDevices=devices.slice().sort(function(a,b){var aOnline=isDeviceOnline(a);var bOnline=isDeviceOnline(b);if(aOnline&&!bOnline)return-1;if(!aOnline&&bOnline)return 1;var aIp=a.ip4||'';var bIp=b.ip4||'';var aIpParts=aIp.split('.').map(function(part){return parseInt(part)||0;});var bIpParts=bIp.split('.').map(function(part){return parseInt(part)||0;});for(var i=0;i<4;i++){var aPart=aIpParts[i]||0;var bPart=bIpParts[i]||0;if(aPart!==bPart){return aPart-bPart;}}
return(a.mac||'').localeCompare(b.mac||'');});sortedDevices.forEach(function(device){if(device.mac){var label=(device.host||device.ip4||device.mac||'-')+(device.ip4?' ('+device.ip4+')':'')+(device.mac?' ['+device.mac+']':'');var option=E('option',{'value':device.mac},label);macSelect.appendChild(option);}});if(currentValue&&currentValue!=='all'){var optionExists=false;for(var i=0;i<macSelect.options.length;i++){if(macSelect.options[i].value===currentValue){optionExists=true;break;}}
if(optionExists){macSelect.value=currentValue;}else{macSelect.value='all';}}}
function drawIncrementsChart(canvas,increments,aggregation,scale,offsetX){if(!canvas||!increments||increments.length===0)return;scale=scale||1;offsetX=offsetX||0;var dpr=window.devicePixelRatio||1;var cssWidth=canvas.parentElement.offsetWidth||600;var cssHeight=300;canvas.style.width=cssWidth+'px';canvas.style.height=cssHeight+'px';canvas.width=Math.max(1,Math.floor(cssWidth*dpr));canvas.height=Math.max(1,Math.floor(cssHeight*dpr));var ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);var width=cssWidth;var height=cssHeight;var originalIncrements=canvas.__bandixIncrementsOriginal||increments;var maxValue=0;originalIncrements.forEach(function(item){maxValue=Math.max(maxValue,item.total_bytes||0);});if(maxValue===0){ctx.fillStyle='rgba(0, 0, 0, 0.5)';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(_('No data'),width/2,height/2);return;}
var fontSize=12;ctx.font=fontSize+'px sans-serif';var maxLabelText=formatSize(maxValue);var zeroLabelText=formatSize(0);var maxLabelWidth=Math.max(ctx.measureText(maxLabelText).width,ctx.measureText(zeroLabelText).width);var padding={top:20,right:20,bottom:40,left:80};padding.left=Math.max(padding.left,Math.ceil(maxLabelWidth)+30);var chartWidth=width-padding.left-padding.right;var chartHeight=height-padding.top-padding.bottom;if(!canvas.__bandixIncrementsOriginal){canvas.__bandixIncrementsOriginal=increments;}
var totalLen=increments.length;var displayIncrements=increments;var displayStartIndex=0;var displayEndIndex=totalLen;if(scale>1){var visibleLen=Math.ceil(totalLen/scale);displayStartIndex=Math.floor(offsetX);displayEndIndex=Math.min(totalLen,displayStartIndex+visibleLen);displayIncrements=increments.slice(displayStartIndex,displayEndIndex);}
ctx.clearRect(0,0,width,height);var axisTextColor='#9ca3af';var gridColor='rgba(148,163,184,0.08)';ctx.font='12px sans-serif';var gridLines=4;ctx.strokeStyle=gridColor;ctx.lineWidth=0.8;for(var i=0;i<=gridLines;i++){var y=padding.top+(chartHeight/gridLines)*i;var value=maxValue*(1-i/gridLines);ctx.beginPath();ctx.moveTo(padding.left,y);ctx.lineTo(width-padding.right,y);ctx.stroke();ctx.fillStyle=axisTextColor;ctx.textAlign='right';ctx.textBaseline='middle';var yLabelY=(i===gridLines)?y-4:y;ctx.fillText(formatSize(value),padding.left-8,yLabelY);}
var barWidth=chartWidth/displayIncrements.length;var barDisplayWidth=barWidth*0.7;var baseY=height-padding.bottom;function px(v){return Math.round(v);}
function pxStroke(v){return Math.round(v)+0.5;}
displayIncrements.forEach(function(item,index){var barX=padding.left+barWidth*index+(barWidth-barDisplayWidth)/2;var rxHeight=chartHeight*((item.rx_bytes||0)/maxValue);var txHeight=chartHeight*((item.tx_bytes||0)/maxValue);var totalHeight=rxHeight+txHeight;var x=px(barX);var w=Math.max(1,px(barDisplayWidth));var totalH=px(totalHeight);var rxH=px(rxHeight);var txH=px(txHeight);var yBase=px(baseY);if(rxH>0){var rxY=yBase-rxH;ctx.fillStyle=BANDIX_COLOR_DOWNLOAD;ctx.fillRect(x,rxY,w,rxH);ctx.strokeStyle='#0891b2';ctx.lineWidth=1;ctx.strokeRect(pxStroke(x),pxStroke(rxY),w,rxH);}
if(txH>0){var txY=yBase-totalH;ctx.fillStyle=BANDIX_COLOR_UPLOAD;ctx.fillRect(x,txY,w,txH);ctx.strokeStyle='#ea580c';ctx.lineWidth=1;ctx.strokeRect(pxStroke(x),pxStroke(txY),w,txH);}});canvas.barPositions=[];displayIncrements.forEach(function(item,index){var barX=padding.left+barWidth*index+(barWidth-barDisplayWidth)/2;var originalIndex=displayStartIndex+index;canvas.barPositions.push({x:px(barX),width:Math.max(1,px(barDisplayWidth)),index:originalIndex,item:item});});canvas.__bandixIncrements={increments:displayIncrements,originalIncrements:canvas.__bandixIncrementsOriginal||increments,aggregation:aggregation,scale:scale,offsetX:offsetX,displayStartIndex:displayStartIndex,displayEndIndex:displayEndIndex};ctx.fillStyle=axisTextColor;ctx.textAlign='center';var isMobile=window.innerWidth<=768;var isDaily=aggregation==='daily';var barWidth=chartWidth/displayIncrements.length;var maxLabels=7;var labelIndices=[];if(displayIncrements.length<=maxLabels){for(var i=0;i<displayIncrements.length;i++){labelIndices.push(i);}}else{for(var i=0;i<maxLabels;i++){var idx=Math.round((i/(maxLabels-1))*(displayIncrements.length-1));labelIndices.push(idx);}}
if(isMobile&&displayIncrements.length>2){labelIndices=[0,displayIncrements.length-1];}
labelIndices.forEach(function(index){if(index<0||index>=displayIncrements.length)return;var item=displayIncrements[index];var x=padding.left+barWidth*(index+0.5);var date=new Date(item.ts_ms);var timeStr;if(isDaily){var year=date.getFullYear();var month=(date.getMonth()+1).toString().padStart(2,'0');var day=date.getDate().toString().padStart(2,'0');timeStr=month+'/'+day;}else{var startTs=item.start||item.ts_ms;var startDate=new Date(startTs);var hour=startDate.getHours();timeStr=(hour<10?'0':'')+hour+':00';}
var textWidth=ctx.measureText(timeStr).width;var labelX=x;if(labelX+textWidth/2>width-padding.right){labelX=width-padding.right-textWidth/2;}
if(labelX-textWidth/2<padding.left){labelX=padding.left+textWidth/2;}
ctx.fillText(timeStr,labelX,height-padding.bottom+20);});try{if(isMobile)return;var hoverIndex=canvas.__bandixIncrementsHoverIndex;if(typeof hoverIndex==='number'&&hoverIndex>=0){var displayIndex=hoverIndex-displayStartIndex;if(displayIndex>=0&&displayIndex<displayIncrements.length){var barX=padding.left+barWidth*displayIndex+(barWidth-barDisplayWidth)/2;var hoverX=barX+barDisplayWidth/2;ctx.save();ctx.strokeStyle='rgba(156,163,175,0.9)';ctx.lineWidth=1;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(hoverX,padding.top);ctx.lineTo(hoverX,height-padding.bottom);ctx.stroke();ctx.setLineDash([]);ctx.restore();}}}catch(e){}}
function setupChartTooltip(canvas,tooltip,increments,aggregation,networkType){if(!canvas||!tooltip||!increments||increments.length===0)return;var formatTime=function(tsMs,isDaily){var date=new Date(tsMs);if(isDaily){var year=date.getFullYear();var month=(date.getMonth()+1).toString().padStart(2,'0');var day=date.getDate().toString().padStart(2,'0');return year+'/'+month+'/'+day;}else{var year=date.getFullYear();var month=(date.getMonth()+1).toString().padStart(2,'0');var day=date.getDate().toString().padStart(2,'0');var hours=date.getHours().toString().padStart(2,'0');var minutes=date.getMinutes().toString().padStart(2,'0');return year+'/'+month+'/'+day+' '+hours+':'+minutes;}};var formatTimeRange=function(startTsMs,endTsMs,isDaily){var startTime=formatTime(startTsMs,isDaily);var endTime=formatTime(endTsMs,isDaily);if(isDaily){return startTime+' - '+endTime;}else{var startDate=new Date(startTsMs);var endDate=new Date(endTsMs);if(startDate.toDateString()===endDate.toDateString()){var year=startDate.getFullYear();var month=(startDate.getMonth()+1).toString().padStart(2,'0');var day=startDate.getDate().toString().padStart(2,'0');var startTimeOnly=startDate.getHours().toString().padStart(2,'0')+':'+
startDate.getMinutes().toString().padStart(2,'0');var endTimeOnly=endDate.getHours().toString().padStart(2,'0')+':'+
endDate.getMinutes().toString().padStart(2,'0');return year+'/'+month+'/'+day+' '+startTimeOnly+' - '+endTimeOnly;}else{return startTime+' - '+endTime;}}};var isDaily=aggregation==='daily';var padding={top:20,right:20,bottom:40,left:80};var chartWidth=(canvas.parentElement.offsetWidth||600)-padding.left-padding.right;var barWidth=chartWidth/increments.length;var barDisplayWidth=barWidth*0.7;canvas.addEventListener('mousemove',function(e){var rect=canvas.getBoundingClientRect();var x=e.clientX-rect.left;var y=e.clientY-rect.top;if(x<padding.left||x>rect.width-padding.right||y<padding.top||y>rect.height-padding.bottom){delete canvas.__bandixIncrementsHoverIndex;var info=canvas.__bandixIncrements;if(info&&info.originalIncrements){drawIncrementsChart(canvas,info.originalIncrements,aggregation,info.scale||1,info.offsetX||0);}else{drawIncrementsChart(canvas,increments,aggregation);}
tooltip.style.display='none';return;}
var barIndex=-1;if(canvas.barPositions){for(var i=0;i<canvas.barPositions.length;i++){var bar=canvas.barPositions[i];if(x>=bar.x&&x<=bar.x+bar.width){barIndex=bar.index;break;}}}
var info=canvas.__bandixIncrements;var originalIncrements=(info&&info.originalIncrements)?info.originalIncrements:increments;if(barIndex>=0&&barIndex<originalIncrements.length){var prevHoverIndex=canvas.__bandixIncrementsHoverIndex;canvas.__bandixIncrementsHoverIndex=barIndex;if(prevHoverIndex!==barIndex){if(info&&info.originalIncrements){drawIncrementsChart(canvas,info.originalIncrements,aggregation,info.scale||1,info.offsetX||0);}else{drawIncrementsChart(canvas,increments,aggregation);}}
var item=originalIncrements[barIndex];var timeStr=formatTimeRange(item.start||item.ts_ms,item.end||item.ts_ms,isDaily);var speedUnit=uci.get('bandix','traffic','speed_unit')||'bytes';var tooltipContent='<div class="traffic-increments-tooltip-title">'+timeStr+'</div>';if(networkType==='wan'){tooltipContent+='<div class="traffic-increments-tooltip-section">'+'<div class="traffic-increments-tooltip-section-title">'+_('WAN Traffic')+'</div>'+'<div class="ht-kpis">'+'<div class="ht-kpi up">'+'<div class="ht-k-label">WAN Upload</div>'+'<div class="ht-k-value">'+formatSize(item.w_tx_b||0)+'</div>'+'</div>'+'<div class="ht-kpi down">'+'<div class="ht-k-label">WAN Download</div>'+'<div class="ht-k-value">'+formatSize(item.w_rx_b||0)+'</div>'+'</div>'+'</div>'+'<div class="ht-divider"></div>'+'<div class="ht-section-title">'+_('Upload Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.w_tx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.w_tx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.w_tx_max||0,speedUnit)+'</span></div>'+'<div class="ht-section-title" style="margin-top: 8px;">'+_('Download Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.w_rx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.w_rx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.w_rx_max||0,speedUnit)+'</span></div>'+'</div>';}else if(networkType==='lan'){tooltipContent+='<div class="traffic-increments-tooltip-section">'+'<div class="traffic-increments-tooltip-section-title">'+_('LAN Traffic')+'</div>'+'<div class="ht-kpis">'+'<div class="ht-kpi up">'+'<div class="ht-k-label">LAN Upload</div>'+'<div class="ht-k-value">'+formatSize(item.l_tx_b||0)+'</div>'+'</div>'+'<div class="ht-kpi down">'+'<div class="ht-k-label">LAN Download</div>'+'<div class="ht-k-value">'+formatSize(item.l_rx_b||0)+'</div>'+'</div>'+'</div>'+'<div class="ht-divider"></div>'+'<div class="ht-section-title">'+_('Upload Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.l_tx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.l_tx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.l_tx_max||0,speedUnit)+'</span></div>'+'<div class="ht-section-title" style="margin-top: 8px;">'+_('Download Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.l_rx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.l_rx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.l_rx_max||0,speedUnit)+'</span></div>'+'</div>';}else{tooltipContent+='<div class="traffic-increments-tooltip-section">'+'<div class="traffic-increments-tooltip-section-title">'+_('WAN Traffic')+'</div>'+'<div class="ht-kpis">'+'<div class="ht-kpi up">'+'<div class="ht-k-label">WAN Upload</div>'+'<div class="ht-k-value">'+formatSize(item.w_tx_b||0)+'</div>'+'</div>'+'<div class="ht-kpi down">'+'<div class="ht-k-label">WAN Download</div>'+'<div class="ht-k-value">'+formatSize(item.w_rx_b||0)+'</div>'+'</div>'+'</div>'+'<div class="ht-divider"></div>'+'<div class="ht-section-title">'+_('Upload Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.w_tx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.w_tx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.w_tx_max||0,speedUnit)+'</span></div>'+'<div class="ht-section-title" style="margin-top: 8px;">'+_('Download Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.w_rx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.w_rx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.w_rx_max||0,speedUnit)+'</span></div>'+'</div>'+'<div class="traffic-increments-tooltip-section">'+'<div class="traffic-increments-tooltip-section-title">'+_('LAN Traffic')+'</div>'+'<div class="ht-kpis">'+'<div class="ht-kpi up">'+'<div class="ht-k-label">LAN Upload</div>'+'<div class="ht-k-value">'+formatSize(item.l_tx_b||0)+'</div>'+'</div>'+'<div class="ht-kpi down">'+'<div class="ht-k-label">LAN Download</div>'+'<div class="ht-k-value">'+formatSize(item.l_rx_b||0)+'</div>'+'</div>'+'</div>'+'<div class="ht-divider"></div>'+'<div class="ht-section-title">'+_('Upload Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.l_tx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.l_tx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.l_tx_max||0,speedUnit)+'</span></div>'+'<div class="ht-section-title" style="margin-top: 8px;">'+_('Download Statistics')+'</div>'+'<div class="ht-row"><span class="ht-key">'+_('Average')+'</span><span class="ht-val">'+formatByterate(item.l_rx_avg||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">P95</span><span class="ht-val">'+formatByterate(item.l_rx_p95||0,speedUnit)+'</span></div>'+'<div class="ht-row"><span class="ht-key">'+_('Maximum')+'</span><span class="ht-val">'+formatByterate(item.l_rx_max||0,speedUnit)+'</span></div>'+'</div>';}
tooltip.innerHTML=tooltipContent;tooltip.style.display='block';tooltip.offsetHeight;var tooltipWidth=tooltip.offsetWidth||280;var tooltipHeight=tooltip.offsetHeight||200;var tooltipX=e.clientX+20;var tooltipY=e.clientY-tooltipHeight-20;if(tooltipY<0){tooltipY=e.clientY+20;}
if(tooltipX+tooltipWidth>window.innerWidth){tooltipX=e.clientX-tooltipWidth-20;}
if(tooltipX<0){tooltipX=10;}
if(tooltipY<0){tooltipY=10;}
if(tooltipY+tooltipHeight>window.innerHeight){tooltipY=window.innerHeight-tooltipHeight-10;}
tooltip.style.left=tooltipX+'px';tooltip.style.top=tooltipY+'px';}else{delete canvas.__bandixIncrementsHoverIndex;tooltip.style.display='none';}});canvas.addEventListener('mouseleave',function(){delete canvas.__bandixIncrementsHoverIndex;drawIncrementsChart(canvas,increments,aggregation);tooltip.style.display='none';});}
poll.add(updateDeviceData,1);poll.add(function(){return fetchAllScheduleRules().then(function(){if(window.__bandixRenderTable){window.__bandixRenderTable();}});},5000);updateDeviceData();refreshWhitelistStatus();fetchAllScheduleRules();updateTrafficStatistics();setTimeout(function(){var startDateInput=document.getElementById('usage-ranking-start-date');var endDateInput=document.getElementById('usage-ranking-end-date');var queryBtn=document.getElementById('usage-ranking-query-btn');var resetBtn=document.getElementById('usage-ranking-reset-btn');var networkTypeSelect=document.getElementById('usage-ranking-network-type');var timeline=document.getElementById('usage-ranking-timeline');var timelineRange=document.getElementById('usage-ranking-timeline-range');var sectionEl=startDateInput?(startDateInput.closest('.traffic-stats-section')||document):document;var presetBtns=sectionEl.querySelectorAll('.usage-ranking-query-presets .cbi-button[data-preset]');if(!presetBtns.length||!startDateInput||!endDateInput||!queryBtn||!resetBtn){console.error('Time range query elements not found');return;}
var today=new Date();today.setHours(0,0,0,0);var todayMs=today.getTime();var formatDateInput=function(date){var year=date.getFullYear();var month=(date.getMonth()+1).toString().padStart(2,'0');var day=date.getDate().toString().padStart(2,'0');return year+'-'+month+'-'+day;};var todayStr=formatDateInput(today);startDateInput.max=todayStr;endDateInput.max=todayStr;var updateTimeline=function(startDate,endDate){if(!timeline||!timelineRange||!startDate||!endDate)return;var startMs=new Date(startDate+'T00:00:00').getTime();var endMs=new Date(endDate+'T23:59:59').getTime();var oneYearAgoMs=todayMs-365*24*60*60*1000;var totalRange=todayMs-oneYearAgoMs;var selectedRange=endMs-startMs;var leftPercent=Math.max(0,((startMs-oneYearAgoMs)/totalRange)*100);var widthPercent=Math.min(100,(selectedRange/totalRange)*100);timelineRange.style.left=leftPercent+'%';timelineRange.style.width=widthPercent+'%';};var setDateRange=function(startDate,endDate,preset){startDateInput.value=formatDateInput(new Date(startDate));endDateInput.value=formatDateInput(new Date(endDate));presetBtns.forEach(function(btn){btn.className='cbi-button cbi-button-neutral';});if(preset){var presetBtn=sectionEl.querySelector('.usage-ranking-query-presets .cbi-button[data-preset="'+preset+'"]');if(presetBtn)presetBtn.className='cbi-button cbi-button-positive';}
updateTimeline(startDateInput.value,endDateInput.value);};var queryData=function(){var startDate=startDateInput.value;var endDate=endDateInput.value;if(!startDate||!endDate){alert(_('Please select both start and end dates'));return;}
var startMs=new Date(startDate+'T00:00:00').getTime();var endMs=new Date(endDate+'T23:59:59').getTime();if(startMs>endMs){alert(_('Start date must be earlier than end date'));return;}
usageRankingCustomRange={start_ms:startMs,end_ms:endMs};if(queryBtn){queryBtn.disabled=true;queryBtn.classList.add('bandix-loading');}
console.log('Querying with range:',usageRankingCustomRange);var removeLoading=function(){if(queryBtn){queryBtn.disabled=false;queryBtn.classList.remove('bandix-loading');}};try{updateTrafficStatistics(usageRankingCustomRange,removeLoading);}catch(error){console.error('Query failed:',error);removeLoading();}};presetBtns.forEach(function(btn){btn.addEventListener('click',function(){var preset=this.getAttribute('data-preset');var startDate,endDate;switch(preset){case'today':startDate=new Date(today);endDate=new Date(today);break;case'thisweek':var dayOfWeek=today.getDay();var mondayOffset=dayOfWeek===0?-6:1-dayOfWeek;startDate=new Date(todayMs+mondayOffset*24*60*60*1000);startDate.setHours(0,0,0,0);endDate=new Date(today);break;case'lastweek':var lastWeekDayOfWeek=today.getDay();var lastWeekMondayOffset=lastWeekDayOfWeek===0?-13:-6-lastWeekDayOfWeek;startDate=new Date(todayMs+lastWeekMondayOffset*24*60*60*1000);startDate.setHours(0,0,0,0);endDate=new Date(startDate);endDate.setDate(endDate.getDate()+6);endDate.setHours(23,59,59,999);break;case'thismonth':startDate=new Date(today.getFullYear(),today.getMonth(),1);endDate=new Date(today);break;case'lastmonth':var lastMonth=new Date(today.getFullYear(),today.getMonth()-1,1);startDate=new Date(lastMonth.getFullYear(),lastMonth.getMonth(),1);endDate=new Date(lastMonth.getFullYear(),lastMonth.getMonth()+1,0);break;case'7days':startDate=new Date(todayMs-6*24*60*60*1000);endDate=new Date(today);break;case'30days':startDate=new Date(todayMs-29*24*60*60*1000);endDate=new Date(today);break;case'90days':startDate=new Date(todayMs-89*24*60*60*1000);endDate=new Date(today);break;case'1year':startDate=new Date(today.getFullYear()-1,today.getMonth(),today.getDate());endDate=new Date(today);break;}
setDateRange(startDate,endDate,preset);queryData();});});startDateInput.addEventListener('change',function(){updateTimeline(this.value,endDateInput.value);});endDateInput.addEventListener('change',function(){updateTimeline(startDateInput.value,this.value);});if(queryBtn){queryBtn.addEventListener('click',queryData);}
if(networkTypeSelect){networkTypeSelect.addEventListener('change',function(){if(queryBtn){queryBtn.disabled=true;queryBtn.classList.add('bandix-loading');}
var removeLoading=function(){if(queryBtn){queryBtn.disabled=false;queryBtn.classList.remove('bandix-loading');}};try{updateTrafficStatistics(usageRankingCustomRange,removeLoading);}catch(e){removeLoading();}});}
if(resetBtn){resetBtn.addEventListener('click',function(){var oneYearAgo=new Date(today.getFullYear()-1,today.getMonth(),today.getDate());setDateRange(oneYearAgo,today,'1year');queryData();});}
var oneYearAgo=new Date(today.getFullYear()-1,today.getMonth(),today.getDate());setDateRange(oneYearAgo,today,'1year');var startMs=oneYearAgo.getTime();var endToday=new Date(today);endToday.setHours(23,59,59,999);var endMs=endToday.getTime();usageRankingCustomRange={start_ms:startMs,end_ms:endMs};updateTrafficStatistics(usageRankingCustomRange);},500);setTimeout(function(){var aggregationSelect=document.getElementById('traffic-increments-aggregation');var macSelect=document.getElementById('traffic-increments-mac');var networkTypeSelect=document.getElementById('traffic-increments-network-type');if(aggregationSelect){aggregationSelect.addEventListener('change',function(){updateTrafficIncrements();});}
if(macSelect){macSelect.addEventListener('change',function(){updateTrafficIncrements();});}
if(networkTypeSelect){networkTypeSelect.addEventListener('change',function(){updateTrafficIncrements();});}},600);setTimeout(function(){var startDateInput=document.getElementById('traffic-increments-start-date');var endDateInput=document.getElementById('traffic-increments-end-date');var queryBtn=document.getElementById('traffic-increments-query-btn');var resetBtn=document.getElementById('traffic-increments-reset-btn');var sectionEl=startDateInput?(startDateInput.closest('.traffic-stats-section')||document):document;var presetBtns=sectionEl.querySelectorAll('.usage-ranking-query-presets .cbi-button[data-preset]');var timeline=document.getElementById('traffic-increments-timeline');var timelineRange=document.getElementById('traffic-increments-timeline-range');if(!presetBtns.length||!startDateInput||!endDateInput||!queryBtn||!resetBtn){console.error('Traffic Timeline time range query elements not found');return;}
var today=new Date();today.setHours(0,0,0,0);var todayMs=today.getTime();var formatDateInput=function(date){var year=date.getFullYear();var month=(date.getMonth()+1).toString().padStart(2,'0');var day=date.getDate().toString().padStart(2,'0');return year+'-'+month+'-'+day;};var todayStr=formatDateInput(today);startDateInput.max=todayStr;endDateInput.max=todayStr;var updateTimeline=function(startDate,endDate){if(!timeline||!timelineRange||!startDate||!endDate)return;var startMs=new Date(startDate+'T00:00:00').getTime();var endMs=new Date(endDate+'T23:59:59').getTime();var oneYearAgoMs=todayMs-365*24*60*60*1000;var totalRange=todayMs-oneYearAgoMs;var selectedRange=endMs-startMs;var leftPercent=Math.max(0,((startMs-oneYearAgoMs)/totalRange)*100);var widthPercent=Math.min(100,(selectedRange/totalRange)*100);timelineRange.style.left=leftPercent+'%';timelineRange.style.width=widthPercent+'%';};var setDateRange=function(startDate,endDate,preset){startDateInput.value=formatDateInput(new Date(startDate));endDateInput.value=formatDateInput(new Date(endDate));presetBtns.forEach(function(btn){btn.className='cbi-button cbi-button-neutral';});if(preset){var presetBtn=sectionEl.querySelector('.usage-ranking-query-presets .cbi-button[data-preset="'+preset+'"]');if(presetBtn)presetBtn.className='cbi-button cbi-button-positive';}
updateTimeline(startDateInput.value,endDateInput.value);};var queryData=function(){var startDate=startDateInput.value;var endDate=endDateInput.value;if(!startDate||!endDate){alert(_('Please select both start and end dates'));return;}
var startMs=new Date(startDate+'T00:00:00').getTime();var endMs=new Date(endDate+'T23:59:59').getTime();if(startMs>endMs){alert(_('Start date must be earlier than end date'));return;}
trafficIncrementsCustomRange={start_ms:startMs,end_ms:endMs};if(queryBtn){queryBtn.disabled=true;queryBtn.classList.add('bandix-loading');}
console.log('Traffic Timeline querying with range:',trafficIncrementsCustomRange);var removeLoading=function(){if(queryBtn){queryBtn.disabled=false;queryBtn.classList.remove('bandix-loading');}};try{updateTrafficIncrements(startMs,endMs,null,null,removeLoading);}catch(error){console.error('Traffic Timeline query failed:',error);removeLoading();}};presetBtns.forEach(function(btn){btn.addEventListener('click',function(){var preset=this.getAttribute('data-preset');var startDate,endDate;switch(preset){case'today':startDate=new Date(today);endDate=new Date(today);break;case'thisweek':var dayOfWeek=today.getDay();var mondayOffset=dayOfWeek===0?-6:1-dayOfWeek;startDate=new Date(todayMs+mondayOffset*24*60*60*1000);startDate.setHours(0,0,0,0);endDate=new Date(today);break;case'lastweek':var lastWeekDayOfWeek=today.getDay();var lastWeekMondayOffset=lastWeekDayOfWeek===0?-13:-6-lastWeekDayOfWeek;startDate=new Date(todayMs+lastWeekMondayOffset*24*60*60*1000);startDate.setHours(0,0,0,0);endDate=new Date(startDate);endDate.setDate(endDate.getDate()+6);endDate.setHours(23,59,59,999);break;case'thismonth':startDate=new Date(today.getFullYear(),today.getMonth(),1);endDate=new Date(today);break;case'lastmonth':var lastMonth=new Date(today.getFullYear(),today.getMonth()-1,1);startDate=new Date(lastMonth.getFullYear(),lastMonth.getMonth(),1);endDate=new Date(lastMonth.getFullYear(),lastMonth.getMonth()+1,0);break;case'7days':startDate=new Date(todayMs-6*24*60*60*1000);endDate=new Date(today);break;case'30days':startDate=new Date(todayMs-29*24*60*60*1000);endDate=new Date(today);break;case'90days':startDate=new Date(todayMs-89*24*60*60*1000);endDate=new Date(today);break;case'1year':startDate=new Date(today.getFullYear()-1,today.getMonth(),today.getDate());endDate=new Date(today);break;}
setDateRange(startDate,endDate,preset);queryData();});});if(queryBtn){queryBtn.addEventListener('click',queryData);}
if(resetBtn){resetBtn.addEventListener('click',function(){var oneYearAgo=new Date(today.getFullYear()-1,today.getMonth(),today.getDate());setDateRange(oneYearAgo,today,'1year');queryData();});}
var oneYearAgo=new Date(today.getFullYear()-1,today.getMonth(),today.getDate());setDateRange(oneYearAgo,today,'1year');startDateInput.addEventListener('change',function(){updateTimeline(this.value,endDateInput.value);});endDateInput.addEventListener('change',function(){updateTimeline(startDateInput.value,this.value);});var startMs=oneYearAgo.getTime();var endToday=new Date(today);endToday.setHours(23,59,59,999);var endMs=endToday.getTime();trafficIncrementsCustomRange={start_ms:startMs,end_ms:endMs};updateTrafficIncrements(startMs,endMs,null,null);},700);(function(){setTimeout(function(){callGetVersion().then(function(result){if(result){var luciVersionEl=document.getElementById('bandix-luci-version');if(luciVersionEl&&result.luci_app_version){luciVersionEl.textContent=result.luci_app_version;}
var coreVersionEl=document.getElementById('bandix-core-version');if(coreVersionEl&&result.bandix_version){coreVersionEl.textContent=result.bandix_version;}}}).catch(function(err){console.debug('Failed to load version:',err);});},100);})();(function(){setTimeout(function(){callCheckUpdate().then(function(result){if(!result)return;var hasUpdate=false;if(result.luci_has_update===true||result.luci_has_update==='1'||result.luci_has_update===1){hasUpdate=true;}
if(result.bandix_has_update===true||result.bandix_has_update==='1'||result.bandix_has_update===1){hasUpdate=true;}
var updateBadge=document.getElementById('bandix-update-badge');if(updateBadge){if(hasUpdate){updateBadge.style.display='inline-block';updateBadge.onclick=function(){window.location.href='/cgi-bin/luci/admin/services/bandix/settings';};updateBadge.title=_('Update available, click to go to settings');}else{updateBadge.style.display='none';}}}).catch(function(err){console.debug('Failed to check update:',err);});},500);})();return view;}});