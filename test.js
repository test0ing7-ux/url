const originalHost = 'exam.testpad.chitkarauniversity.edu.in';
const currentProxyHost = 'exam.testpad.chitkarauniversity.edu.in.chitkara.dns.navy';
const regex = new RegExp('(?<!/https?://)(?<!/https?://www\\.)' + originalHost.replace(/\./g, '\\.'), 'g');

let html = 'isChitkara="exam.testpad.chitkarauniversity.edu.in"===window.location.hostname';
html += ' src="/https://exam.testpad.chitkarauniversity.edu.in/static/js/main.js"';

console.log(html.replace(regex, currentProxyHost));
