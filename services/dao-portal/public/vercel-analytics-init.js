/* Vercel Web Analytics: page views only; never send URL queries or fragments. */
window.va = window.va || function () {
  (window.vaq = window.vaq || []).push(arguments);
};
window.va('beforeSend', function (event) {
  var url = new URL(event.url);
  url.search = '';
  url.hash = '';
  return Object.assign({}, event, { url: url.href });
});
