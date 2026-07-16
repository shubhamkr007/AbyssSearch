// Dev entry. Registering the custom element is enough - index.html contains the
// <enterprise-search> tag. By default it uses the built-in demo (fake) gateway.
//
// To point the widget at a REAL running gateway, pass query params, e.g.:
//   http://localhost:5173/?api=http://localhost:8081&key=pk_test_demo
// With no params it stays on the offline fake gateway (api-base="demo").
import './element';

const params = new URLSearchParams(location.search);
const api = params.get('api');
const key = params.get('key');
const el = document.querySelector('enterprise-search');
if (el) {
  if (api) el.setAttribute('api-base', api);
  if (key) el.setAttribute('tenant-key', key);
  if (api) {
    // Surface which backend we're talking to, for clarity while testing.
    // eslint-disable-next-line no-console
    console.info(`[enterprise-search dev] api-base=${api} tenant-key=${key ?? '(unset)'}`);
  }
}
