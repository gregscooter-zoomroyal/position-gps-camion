function uid(prefix = "id") {
  return prefix + "-" + Math.random().toString(36).slice(2, 9);
}

function baseTheme(overrides = {}) {
  return Object.assign({
    primary: "#0f766e",
    accent: "#f59e0b",
    bg: "#ffffff",
    text: "#111827",
    muted: "#6b7280",
    font: "DM Sans"
  }, overrides);
}

function section(type, data) {
  return { id: uid("sec"), type, data };
}

const TEMPLATES = [
  {
    id: "resto",
    name: "Restaurant",
    blurb: "Menu, ambiance, réservation.",
    cover: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=800&q=70",
    build(name) {
      const t = baseTheme({ primary: "#7f1d1d", accent: "#d4a017" });
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Menu,À propos,Contact" }),
            section("hero", {
              kicker: "Cuisine du terroir",
              title: name,
              subtitle: "Une table chaleureuse, des produits d'ici, chaque soir.",
              cta: "Réserver une table",
              image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1600&q=80"
            }),
            section("services", {
              title: "La carte",
              items: [
                { title: "Entrées", text: "Tartare, velouté, planche du moment." },
                { title: "Plats", text: "Poisson du jour, braisés, grillades." },
                { title: "Desserts", text: "Tarte maison, crèmes, fromages." }
              ]
            }),
            section("video", {
              title: "En cuisine",
              url: "https://www.youtube.com/watch?v=zyYgDtY2AMY"
            }),
            section("about", {
              title: "Notre histoire",
              text: "Une équipe passionnée, un cellier choisi, et le goût de bien recevoir.",
              image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80"
            }),
            section("contact", {
              title: "Réservation",
              address: "120 rue Principale, Montréal",
              phone: "514 555-0140",
              email: "bonjour@exemple.com"
            }),
            section("footer", { brand: name, note: "Ouvert du mardi au samedi." })
          ]
        }]
      };
    }
  },
  {
    id: "plomberie",
    name: "Métiers / construction",
    blurb: "Urgence, services, zone d'intervention.",
    cover: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=800&q=70",
    build(name) {
      const t = baseTheme({ primary: "#1e3a8a", accent: "#f97316" });
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Services,À propos,Contact" }),
            section("hero", {
              kicker: "Service 24/7",
              title: name,
              subtitle: "Installation, réparation, urgence. On se déplace.",
              cta: "Appeler maintenant",
              image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1600&q=80"
            }),
            section("services", {
              title: "Nos services",
              items: [
                { title: "Urgence", text: "Fuite, bris, débouchage — intervention rapide." },
                { title: "Rénovation", text: "Salle de bain, cuisine, chauffage." },
                { title: "Commercial", text: "Immeubles, commerces, contrats d'entretien." }
              ]
            }),
            section("about", {
              title: "Une équipe d'ici",
              text: "Licences en règle, devis clairs, chantier propre. Des années sur le terrain.",
              image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1200&q=80"
            }),
            section("cta", { title: "Un problème aujourd'hui ?", button: "Demander un devis" }),
            section("contact", {
              title: "Contact",
              address: "Québec et rive-sud",
              phone: "418 555-0199",
              email: "info@exemple.com"
            }),
            section("footer", { brand: name, note: "RBQ · assuré." })
          ]
        }]
      };
    }
  },
  {
    id: "salon",
    name: "Salon / esthétique",
    blurb: "Forfaits, galerie, prise de rendez-vous.",
    cover: "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=70",
    build(name) {
      const t = baseTheme({ primary: "#9d174d", accent: "#e8b4b8", font: "Cormorant Garamond" });
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Soins,Galerie,Rendez-vous" }),
            section("hero", {
              kicker: "Soins & coiffure",
              title: name,
              subtitle: "Un espace calme, des soins sur mesure.",
              cta: "Prendre rendez-vous",
              image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1600&q=80"
            }),
            section("services", {
              title: "Soins",
              items: [
                { title: "Coupe & couleur", text: "Consultation, balayage, entretien." },
                { title: "Soins visage", text: "Nettoyage, hydratation, éclat." },
                { title: "Forfaits", text: "Mariage, événements, cadeaux." }
              ]
            }),
            section("gallery", {
              title: "Galerie",
              images: [
                "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=800&q=70",
                "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=800&q=70",
                "https://images.unsplash.com/photo-1522335789203-aabd1fc37bc4?auto=format&fit=crop&w=800&q=70"
              ]
            }),
            section("contact", {
              title: "Rendez-vous",
              address: "45 av. du Parc, Laval",
              phone: "450 555-0112",
              email: "salon@exemple.com"
            }),
            section("footer", { brand: name, note: "Sur rendez-vous." })
          ]
        }]
      };
    }
  },
  {
    id: "pro",
    name: "Cabinet / professionnel",
    blurb: "Confiance, équipe, prise de contact.",
    cover: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=70",
    build(name) {
      const t = baseTheme({ primary: "#1f2937", accent: "#2563eb" });
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Pratique,Équipe,Contact" }),
            section("hero", {
              kicker: "Cabinet",
              title: name,
              subtitle: "Un accompagnement clair, humain, confidentiel.",
              cta: "Prendre rendez-vous",
              image: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80"
            }),
            section("services", {
              title: "Domaines",
              items: [
                { title: "Conseil", text: "Analyse de votre situation, plan d'action." },
                { title: "Représentation", text: "Dossiers, négociations, suivi." },
                { title: "Entreprises", text: "Contrats, conformité, associés." }
              ]
            }),
            section("about", {
              title: "L'approche",
              text: "On explique simplement. On avance étape par étape. Vous restez maître des décisions.",
              image: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80"
            }),
            section("contact", {
              title: "Bureau",
              address: "Tour, 1000 rue de la Gauchetière, Montréal",
              phone: "514 555-0188",
              email: "cabinet@exemple.com"
            }),
            section("footer", { brand: name, note: "Confidentialité garantie." })
          ]
        }]
      };
    }
  },
  {
    id: "commerce",
    name: "Commerce local",
    blurb: "Boutique, produits, horaires.",
    cover: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=70",
    build(name) {
      const t = baseTheme({ primary: "#365314", accent: "#ca8a04" });
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Boutique,Horaires,Contact" }),
            section("hero", {
              kicker: "Boutique",
              title: name,
              subtitle: "Des pièces choisies, un accueil de quartier.",
              cta: "Voir la boutique",
              image: "https://images.unsplash.com/photo-1472851294608-062f82414632?auto=format&fit=crop&w=1600&q=80"
            }),
            section("gallery", {
              title: "Sélection",
              images: [
                "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=800&q=70",
                "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=800&q=70",
                "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=70"
              ]
            }),
            section("video", {
              title: "La boutique",
              url: "https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4"
            }),
            section("contact", {
              title: "Nous trouver",
              address: "8 rue du Marché, Québec",
              phone: "418 555-0160",
              email: "boutique@exemple.com"
            }),
            section("footer", { brand: name, note: "Mar–Sam 10h–18h." })
          ]
        }]
      };
    }
  },
  {
    id: "pavage",
    name: "Pavage / asphalte",
    blurb: "Pose, réparation, devis sur place.",
    cover: "assets/asphalte.jpg",
    build(name) {
      const t = baseTheme({ primary: "#0b0c0e", accent: "#e8a317", text: "#111827", bg: "#737375" });
      t.bgImage = "assets/asphalte.jpg";
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Services,Entreprise,Contact", logo: "assets/logo-pavage-go.png" }),
            section("hero", {
              kicker: "Depuis 1993",
              title: name,
              subtitle: "Pose, réparation et entretien d'asphalte. Une visite, un devis clair.",
              cta: "Demander une estimation",
              image: "",
              video: "",
              logo: "assets/logo-pavage-go.png"
            }),
            section("stats", {
              items: [
                { value: "1993", label: "Fondation" },
                { value: "Sur place", label: "Devis" },
                { value: "RBQ", label: "Licence" }
              ]
            }),
            section("services", {
              title: "Services",
              items: [
                { title: "Pose d'asphalte", text: "Entrée, stationnement, allée. Préparation et pose." },
                { title: "Réparation", text: "Fissures, nids-de-poule, rapieçage, puisards." },
                { title: "Entretien", text: "Scellant, colmatage, recouvrement." }
              ]
            }),
            section("carousel", {
              title: "Réalisations",
              cards: [
                { kicker: "Résidentiel", title: "Entrées", text: "Maisons et allées.", image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80" },
                { kicker: "Commercial", title: "Stationnements", text: "Commerces et immeubles.", image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80" },
                { kicker: "Chantier", title: "Machinerie", text: "Paveuse et compactage.", image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=80" }
              ]
            }),
            section("about", {
              title: "L'entreprise",
              text: "Entreprise familiale. Estimation gratuite sur place.",
              image: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1200&q=80"
            }),
            section("cta", { title: "Estimation gratuite", button: "Nous appeler" }),
            section("contact", {
              title: "Contact",
              address: "Ville, Québec",
              phone: "000 000-0000",
              email: "info@exemple.com"
            }),
            section("footer", { brand: name, note: "Estimation gratuite." })
          ]
        }]
      };
    }
  },
  {
    id: "generic",
    name: "Entreprise",
    blurb: "Base sobre pour n'importe quel client.",
    cover: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70",
    build(name) {
      const t = baseTheme();
      return {
        theme: t,
        pages: [{
          id: "home",
          name: "Accueil",
          sections: [
            section("nav", { brand: name, links: "Services,À propos,Contact" }),
            section("hero", {
              kicker: "Bienvenue",
              title: name,
              subtitle: "Présentez votre entreprise en quelques blocs. Modifiez tout.",
              cta: "Nous joindre",
              image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80"
            }),
            section("services", {
              title: "Ce que nous faisons",
              items: [
                { title: "Offre 1", text: "Décrivez un service phare." },
                { title: "Offre 2", text: "Ajoutez une deuxième force." },
                { title: "Offre 3", text: "Complétez avec un troisième point." }
              ]
            }),
            section("about", {
              title: "À propos",
              text: "Remplacez ce texte par l'histoire du client, l'équipe, la promesse.",
              image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80"
            }),
            section("contact", {
              title: "Contact",
              address: "Ville, Québec",
              phone: "000 000-0000",
              email: "contact@exemple.com"
            }),
            section("footer", { brand: name, note: "Tous droits réservés." })
          ]
        }]
      };
    }
  }
];

const SECTION_CATALOG = [
  { type: "nav", label: "Barre de navigation", group: "En-tête" },
  { type: "hero", label: "Bannière (photo ou vidéo de fond)", group: "En-tête" },
  { type: "video-bg", label: "Emplacement vidéo + texte par-dessus", group: "En-tête" },
  { type: "services", label: "Services", group: "Contenu" },
  { type: "about", label: "À propos", group: "Contenu" },
  { type: "gallery", label: "Galerie photos", group: "Contenu" },
  { type: "carousel", label: "Carrousel (réalisations)", group: "Contenu" },
  { type: "media", label: "Médias / vidéos (lecture)", group: "Contenu" },
  { type: "video", label: "Vidéo encadrée", group: "Contenu" },
  { type: "stats", label: "Chiffres / confiance", group: "Confiance" },
  { type: "quotes", label: "Témoignages", group: "Confiance" },
  { type: "faq", label: "Questions fréquentes", group: "Confiance" },
  { type: "logos", label: "Logos / partenaires", group: "Confiance" },
  { type: "hours", label: "Heures d'ouverture", group: "Contact" },
  { type: "form", label: "Formulaire de contact", group: "Contact" },
  { type: "map", label: "Carte Google", group: "Contact" },
  { type: "cta", label: "Bandeau d'action", group: "Contact" },
  { type: "contact", label: "Coordonnées", group: "Contact" },
  { type: "footer", label: "Pied de page", group: "Contact" }
];

const SITE_FONTS = ["DM Sans", "Inter", "Barlow", "Playfair Display", "Cormorant Garamond"];

function blankSection(type, brand) {
  const map = {
    nav: { brand: brand || "Marque", links: "Accueil,Services,Contact", logo: "" },
    hero: { kicker: "Accroche", title: "Titre principal", subtitle: "Une phrase claire sur l'offre.", cta: "Appel à l'action", href: "", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80", video: "", logo: "" },
    "video-bg": { kicker: "Vidéo", title: "Titre sur la vidéo", subtitle: "Le texte reste lisible, la vidéo joue derrière.", cta: "En savoir plus", href: "", video: "https://videos.pexels.com/video-files/3571264/3571264-hd_1920_1080_30fps.mp4" },
    stats: { items: [{ value: "1993", label: "Depuis" }, { value: "100%", label: "Sur place" }, { value: "RBQ", label: "Licence" }] },
    carousel: { title: "En vedette", cards: [
      { kicker: "Projet", title: "Titre 1", text: "Courte description.", image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=70" },
      { kicker: "Projet", title: "Titre 2", text: "Courte description.", image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=70" },
      { kicker: "Projet", title: "Titre 3", text: "Courte description.", image: "https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=70" }
    ] },
    media: { title: "Médias", items: [
      { kicker: "Vidéo", title: "Titre", image: "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&q=70", video: "https://www.youtube.com/watch?v=zyYgDtY2AMY" }
    ] },
    services: { title: "Services", items: [{ title: "Service", text: "Description courte." }, { title: "Service", text: "Description courte." }, { title: "Service", text: "Description courte." }] },
    about: { title: "À propos", text: "Présentez l'entreprise.", image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80" },
    video: { title: "Vidéo", url: "https://www.youtube.com/watch?v=zyYgDtY2AMY" },
    gallery: { title: "Galerie", images: ["https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=70", "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=70", "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"] },
    quotes: { title: "Ce qu'on dit de nous", items: [
      { text: "Travail propre, délais respectés.", name: "Client" },
      { text: "Devis clair, équipe à l'écoute.", name: "Cliente" }
    ] },
    faq: { title: "Questions fréquentes", items: [
      { q: "Est-ce que l'estimation est gratuite ?", a: "Oui. On se déplace pour voir le chantier." },
      { q: "Quelle est la zone desservie ?", a: "Indiquez les villes ici." }
    ] },
    logos: { title: "Partenaires", items: [
      { label: "APCHQ", image: "" },
      { label: "RBQ", image: "" }
    ] },
    hours: { title: "Heures", items: [
      { day: "Lundi – Vendredi", time: "8 h – 18 h" },
      { day: "Samedi", time: "Sur rendez-vous" },
      { day: "Dimanche", time: "Fermé" }
    ] },
    form: { title: "Écrivez-nous", button: "Envoyer", mailto: "" },
    map: { title: "Nous trouver", query: "14 rue Drummond, Granby, Québec" },
    cta: { title: "Prêt à commencer ?", button: "Nous écrire", href: "" },
    contact: { title: "Contact", address: "Adresse", phone: "Téléphone", email: "courriel@exemple.com" },
    footer: { brand: brand || "Marque", note: "Tous droits réservés." }
  };
  return section(type, map[type] || { title: type });
}
