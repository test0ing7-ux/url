fetch('https://amcatglobal.aspiringminds.com/main.e3081ad07ef367ab.js')
  .then(async r => { 
      const txt = await r.text(); 
      const matches = txt.match(/["']\/[a-zA-Z0-9_\-]*auth[a-zA-Z0-9_\-\/]*["']/g); 
      console.log(matches); 
  })
  .catch(console.error);
