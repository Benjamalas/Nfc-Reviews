// Kliento nustatymai. Naujam klientui: nukopijuok visą šį aplanką ir pakeisk reikšmes.
window.REVIEW_CONFIG = {
  businessName: 'KGF parduotuvė',
  logo: '',                 // pvz. 'logo.png' šiame aplanke; tuščia = rodomos raidės
  logoText: 'KGF',
  accent: '#1f4fd8',

  // Tiesioginė „Rašyti atsiliepimą“ nuoroda (Place ID iš Google Maps).
  googleReviewUrl: 'https://search.google.com/local/writereview?placeid=ChIJGSQEVdUr4UYReTatm_41y_E',

  // Google Apps Script web app URL (žr. README). Tuščia = niekas nesaugoma.
  apiUrl: '',

  goodFrom: 4,              // nuo kiek žvaigždučių siūlyti Google
  autoRedirectSeconds: 4,   // geram įvertinimui – po kiek sek. atidaryti Google (0 = išjungta)

  replyPromise: {
    lt: 'Savininkas asmeniškai perskaitys ir susisieks per 24 val.',
    en: 'The owner will read it personally and get back to you within 24 hours.'
  },

  // Darbuotojų puslapio žinutė. {vardas} = ", Tomas" arba tuščia, {nuoroda} = atsiliepimo nuoroda.
  smsText: 'Sveiki{vardas}! Ačiū, kad apsilankėte KGF parduotuvėje. Būsime labai dėkingi, jei skirsite 30 sek. ir įvertinsite mus: {nuoroda}',

  staff: [],                // pvz. ['Jonas', 'Tomas'] – darbuotojų puslapiui
  publicUrl: ''             // jei bus savas domenas, pvz. 'https://atsiliepimai.lt/kgf/'
};
