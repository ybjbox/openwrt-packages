'use strict';
'require view';
'require dom';
'require poll';
'require fs';
'require uci';
'require rpc';
'require form';
'require network';
'require tools.widgets as widgets';

const callHostHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getHostHints',
	expect: { '': {} }
});

const callDUIDHints = rpc.declare({
	object: 'luci-rpc',
	method: 'getDUIDHints',
	expect: { '': {} }
});

const callDHCPLeases = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPLeases',
	expect: { '': {} }
});

const getDHCPPools = rpc.declare({
	object: 'luci-rpc',
	method: 'getDHCPPools',
	expect: { '': {} }
});

const callNetworkDevices = rpc.declare({
	object: 'luci-rpc',
	method: 'getNetworkDevices',
	expect: { '': {} }
});

const callUfpList = rpc.declare({
	object: 'fingerprint',
	method: 'fingerprint',
});

function listServices() {
	return L.resolveDefault(fs.list('/etc/init.d'), []).then(function(files) {
		const tasks = [];

		for (var i = 0; i < files.length; i++) {
			if (files[i].name == 'dnsmasq' || files[i].name == 'odhcpd') {
				tasks.push(fs.stat('/etc/init.d/' + files[i].name).then(L.bind(function(file) {
					return file.name;
				}, files[i])));
			}
		}

		return Promise.all(tasks);
	});
}

return view.extend({
	load() {
		return Promise.all([
			callHostHints(),
			callDUIDHints(),
			L.resolveDefault(getDHCPPools(), {}),
			network.getNetworks(),
			L.hasSystemFeature('ufpd') ? callUfpList() : null,
			callNetworkDevices(),
			listServices(),
		]);
	},

	render([hosts, duids, pools, networks, macdata, devices, services]) {
		const m = new form.Map('dhcp', _('DHCP and DNS'),
			_('Dnsmasq is a combined DHCP-Server and DNS-Forwarder for NAT firewalls'));

		var s = m.section(form.TypedSection, 'dnsmasq', _('Server Settings'));
		s.anonymous = true;
		s.addremove = false;

		var o = s.option(form.Flag, 'domainneeded',
			_('Domain required'),
			_('Don\'t forward queries for plain (non-dot) names'));
		o.optional = false;

		o = s.option(form.Flag, 'authoritative',
			_('Authoritative'),
			_('This is the only DHCP server in the local network segment'));
		o.optional = false;

		var ss = m.section(form.TypedSection, 'host', _('Static Leases'),
			_('Static leases are used to assign fixed IP addresses and symbolic hostnames to DHCP clients. They are also required for non-dynamic interface configurations in order to increase security.'));
		ss.anonymous = true;
		ss.addremove = true;
		ss.template = 'cbi/tblsection';

		o = ss.option(form.Value, 'name', _('Hostname'));
		o.datatype = 'hostname';
		o.rmempty = true;

		o = ss.option(form.Value, 'mac', _('MAC address'));
		o.rmempty = false;
		o.datatype = 'list(macaddr)';
		L.toArray(hosts).forEach(function(host) {
			if (host && Array.isArray(host.macaddrs) && host.macaddrs.length > 0) o.value(host.macaddrs[0], host.name ? '%s (%s)'.format(host.macaddrs[0], host.name) : host.macaddrs[0]);
		});

		o = ss.option(form.Value, 'ip', _('IPv4 address'));
		o.datatype = 'or(ip4addr, "ignore")';

		var co = ss.option(form.Value, 'comment', _('Comment'));
		co.rmempty = true;

		var so = ss.option(form.Value, 'leasetime',
			_('Lease time'),
			_('Host-specific lease time, e.g. <code>5m</code>, <code>3h</code>, <code>7d</code>.'));
		so.rmempty = true;

		return m.render().then(function(mapEl) {
			poll.add(function() {
				return Promise.all([ callDHCPLeases(), L.resolveDefault(uci.load('dhcp')) ]).then(function(res) {
					const leaseinfo = res[0] || {};
					const mac_comments = {}; uci.sections('dhcp', 'host').forEach(function(s) { L.toArray(s.mac).forEach(function(m) { if (s.comment) mac_comments[m.toLowerCase()] = s.comment; }); });
					const leases = Array.isArray(leaseinfo.dhcp_leases) ? leaseinfo.dhcp_leases : [];
					const leases6 = Array.isArray(leaseinfo.dhcp6_leases) ? leaseinfo.dhcp6_leases : [];

					cbi_update_table('#lease_status_table',
						leases.map(function(lease) {
							let exp;
							let vendor;

							if (lease.expires === false)
								exp = E('em', _('unlimited'));
							else if (lease.expires <= 0)
								exp = E('em', _('expired'));
							else
								exp = '%t'.format(lease.expires);

							const hint = lease.macaddr ? hosts[lease.macaddr] : null;
							const name = hint ? hint.name : null;
							let host = null;

							if (name && lease.hostname && lease.hostname != name)
								host = '%s (%s)'.format(lease.hostname, name);
							else if (lease.hostname)
								host = lease.hostname;

							var cmt = lease.macaddr ? mac_comments[lease.macaddr.toLowerCase()] : null;
							if (cmt) { var raw_h = lease.hostname || name; host = raw_h ? (cmt + ' (' + raw_h + ')') : cmt; }

							if (macdata)
								vendor = macdata[lease.macaddr.toLowerCase()]?.vendor ?? null;

							const columns = [
								'%s'.format(host || '-'),
								lease.ipaddr,
								'%h'.format(vendor ? lease.macaddr + vendor : lease.macaddr),
								lease.duid || '-',
								exp
							];

							return columns;
						}), E('em', _('There are no active leases')));

					cbi_update_table('#lease6_status_table',
						leases6.map(function(lease) {
							let exp;

							if (lease.expires === false)
								exp = E('em', _('unlimited'));
							else if (lease.expires <= 0)
								exp = E('em', _('expired'));
							else
								exp = '%t'.format(lease.expires);

							const hint = lease.macaddr ? hosts[lease.macaddr] : null;
							const name = hint ? hint.name : null;
							let host = null;

							if (name && lease.hostname && lease.hostname != name)
								host = '%s (%s)'.format(lease.hostname, name);
							else if (lease.hostname)
								host = lease.hostname;
							else if (name)
								host = name;

							var cmt6 = lease.macaddr ? mac_comments[lease.macaddr.toLowerCase()] : null;
							if (cmt6) { var raw_h = lease.hostname || name; host = raw_h ? (cmt6 + ' (' + raw_h + ')') : cmt6; }

							const columns = [
								'%s'.format(host || '-'),
								lease.ip6addrs ? lease.ip6addrs.join('<br />') : lease.ip6addr,
								lease.duid,
								lease.iaid,
								exp
							];

							return columns;
						}), E('em', _('There are no active leases')));
				});
			});

			return E('div', { 'class': 'cbi-map', 'id': 'map' }, [
				mapEl,
				E('div', { 'class': 'cbi-section' }, [
					E('h3', _('Active DHCP Leases')),
					E('table', { 'class': 'table', 'id': 'lease_status_table' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th' }, _('Hostname')),
							E('th', { 'class': 'th' }, _('IPv4-Address')),
							E('th', { 'class': 'th' }, _('MAC-Address')),
							E('th', { 'class': 'th' }, _('DUID')),
							E('th', { 'class': 'th' }, _('Leasetime remaining'))
						]),
						E('tr', { 'class': 'tr placeholder' }, [
							E('td', { 'class': 'td', 'colspan': 5 }, [
								E('em', { 'class': 'spinning' }, _('Collecting data...'))
							])
						])
					])
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', _('Active DHCPv6 Leases')),
					E('table', { 'class': 'table', 'id': 'lease6_status_table' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th' }, _('IPv6-Address')),
							E('th', { 'class': 'th' }, _('DUID')),
							E('th', { 'class': 'th' }, _('IAID')),
							E('th', { 'class': 'th' }, _('Leasetime remaining'))
						]),
						E('tr', { 'class': 'tr placeholder' }, [
							E('td', { 'class': 'td', 'colspan': 4 }, [
								E('em', { 'class': 'spinning' }, _('Collecting data...'))
							])
						])
					])
				])
			]);
		});
	}
});
