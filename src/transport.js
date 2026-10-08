(function () {
  'use strict';
  window.KPTTransport = {
    demo: false,
    publicUrl: '__PUBLIC_URL__',
    call(request) {
      return new Promise((resolve, reject) => {
        if (!window.google || !google.script || !google.script.run) { reject(new Error('Open the deployed Google administrator page.')); return; }
        google.script.run.withSuccessHandler(response => {
          if (!response || !response.ok) reject(new Error(response && response.error || 'The server returned an invalid response.'));
          else resolve(response.data);
        }).withFailureHandler(() => reject(new Error('Unable to reach the Google service. Check your connection and retry.'))).rpc(request);
      });
    }
  };
})();
