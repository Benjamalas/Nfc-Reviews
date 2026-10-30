// Kliento nustatymai. Naujam klientui: nukopijuok visą šį aplanką ir pakeisk reikšmes.
window.REVIEW_CONFIG = {
  businessName: 'KGF parduotuvė',
  logo: '',                 // pvz. 'logo.png' šiame aplanke; tuščia = rodomos raidės
  logoText: 'KGF',
  tagline: 'Kompiuterių ir telefonų parduotuvė bei remontas',
  city: 'Marijampolė',
  accent: '#1f4fd8',

  // Tiesioginė „Rašyti atsiliepimą“ nuoroda (Place ID iš Google Maps).
  googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJGSQEVdUr4UYReTatm_41y_E',

  // Google Apps Script web app URL (žr. README). Tuščia = niekas nesaugoma.
  apiUrl: 'https://script.google.com/macros/s/AKfycbzdFnbBdrA5tXO0k-hRRXoicf8w0OG_Lg4FKgcvk_dX8kBmP7iE7as4LkBFj2ASQCSa/exec',

  goodFrom: 4,              // nuo kiek žvaigždučių siūlyti Google

  // Tekstas padėkos ekrane po privataus atsiliepimo.
  replyPromise: {
    lt: 'Netrukus gausite iš mūsų žinutę – norime išsiaiškinti situaciją ir jums padėti.',
    en: 'You will get a message from us shortly – we want to understand what happened and help.'
  },

  publicUrl: ''             // jei bus savas domenas, pvz. 'https://atsiliepimai.lt/kgf/'
};
