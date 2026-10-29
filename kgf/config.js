// Kliento nustatymai. Naujam klientui: nukopijuok visą šį aplanką ir pakeisk reikšmes.
window.REVIEW_CONFIG = {
  businessName: 'KGF parduotuvė',
  logo: '',                 // pvz. 'logo.png' šiame aplanke; tuščia = rodomos raidės
  logoText: 'KGF',
  accent: '#1f4fd8',

  // Tiesioginė „Rašyti atsiliepimą“ nuoroda (Place ID iš Google Maps).
  googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJGSQEVdUr4UYReTatm_41y_E',

  // Google Apps Script web app URL (žr. README). Tuščia = niekas nesaugoma.
  apiUrl: 'https://script.google.com/macros/s/AKfycbzdFnbBdrA5tXO0k-hRRXoicf8w0OG_Lg4FKgcvk_dX8kBmP7iE7as4LkBFj2ASQCSa/exec',

  goodFrom: 4,              // nuo kiek žvaigždučių siūlyti Google

  replyPromise: {
    lt: 'Savininkas asmeniškai perskaitys ir susisieks per 24 val.',
    en: 'The owner will read it personally and get back to you within 24 hours.'
  },

  publicUrl: ''             // jei bus savas domenas, pvz. 'https://atsiliepimai.lt/kgf/'
};
