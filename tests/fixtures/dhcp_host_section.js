// Minimal self-contained fixture for the CI BusyBox runtime test.
// It contains ONLY the anchor strings that the production hot-patch script
// (root/etc/uci-defaults/99-luci-app-dhcp-comment) targets with its sed edits.
// It is intentionally NOT a copy of the stock OpenWrt dhcp.js (avoids licensing
// concerns); it merely needs to satisfy the sed patterns and remain valid JS.

var max_cols=8;

function renderStaticLeases() {
    so=ss.option(form.Value,'name',_('Hostname'),_('The hostname for this host (optional)'));
    so=ss.option(form.DynamicList,'mac',_('MAC Addresses'),_('The hardware address(es) of the device'));
    return pollDHCPLeases();
}

function pollDHCPLeases() {
    return callDHCPLeases().then(function(leaseinfo) {
        var host = leaseinfo.host || '';
        var line = '%h'.format(host || '-');
        return line;
    });
}
