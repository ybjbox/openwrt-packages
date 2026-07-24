'use strict';
/*
 * Fixture: minimal stand-in for the official LuCI dhcp.js static-leases view.
 * It contains ONLY the exact anchor strings the production hot-patch script
 * (root/etc/uci-defaults/99-luci-app-dhcp-comment) sed-matches. The file must
 * stay PRISTINE: the four injected fragments below must NOT appear here before
 * the production script runs:
 *   1) the comment column option (value 'comment')
 *   2) the dynamic column count being raised to nine
 *   3) the mac_comments cache initialization block
 *   4) the lease label re-formatting via a %s placeholder
 *
 * NOTE: option-line spacing is significant. The production sed locates the mac
 * option via an exact, space-free pattern, so the real mac option below keeps
 * that exact spacing to remain patchable. Do NOT write that pattern (or any
 * other production anchor) in this comment block, or sed would match it first.
 */
var o;

o = s.taboption('general', form.Flag, 'ignore', _('Ignore interface'));

var max_cols=8;
var stp = ss.option(form.Flag, 'stp', _('STP'));

/* hostname column (must come BEFORE the mac column) */
so=ss.option(form.Value,'name',_('Hostname'));
so.datatype = 'hostname';
so.rmempty = true;

/* mac column — injection anchor (comment is inserted immediately before this line) */
so=ss.option(form.DynamicList,'mac',_('MAC-Address'),_('MAC address(es)'));
so.datatype = 'list(macaddr)';
so.rmempty = false;

/* lease rendering placeholder — mac_comments lookup anchor is injected here */
function renderLeases() {
    return callDHCPLeases().then(function(leaseinfo) {
        var host = lease.hostname || lease.ip;
        var text = '%h'.format(host || '-');
        return text;
    });
}

/* tail placeholder so the file looks like a real LuCI view */
function noop() { return 0; }
