const publicPort = Number(process.env.DASHBOARD_PUBLIC_PORT || "51234");
const internalPort = Number(process.env.DASHBOARD_INTERNAL_PORT || "51235");
const proxyHost = process.env.DASHBOARD_PROXY_HOST || "0.0.0.0";
const internalHost = process.env.DASHBOARD_INTERNAL_HOST || "127.0.0.1";

if (!Number.isFinite(publicPort) || !Number.isFinite(internalPort)) {
    throw new Error("invalid dashboard port configuration");
}

Bun.serve({
    hostname: proxyHost,
    port: publicPort,
    fetch(req) {
        const url = new URL(req.url);
        const target = `http://${internalHost}:${internalPort}${url.pathname}${url.search}`;
        return fetch(new Request(target, req));
    },
});

console.log(`Dashboard proxy listening on http://${proxyHost}:${publicPort}`);
