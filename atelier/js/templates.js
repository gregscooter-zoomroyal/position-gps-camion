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
  { type: "nav", label: "Barre de navigation" },
  { type: "hero", label: "Bannière" },
  { type: "services", label: "Services" },
  { type: "about", label: "À propos" },
  { type: "video", label: "Vidéo" },
  { type: "gallery", label: "Galerie" },
  { type: "cta", label: "Bandeau d'action" },
  { type: "contact", label: "Contact" },
  { type: "footer", label: "Pied de page" }
];

function blankSection(type, brand) {
  const map = {
    nav: { brand: brand || "Marque", links: "Accueil,Services,Contact" },
    hero: { kicker: "Accroche", title: "Titre principal", subtitle: "Une phrase claire sur l'offre.", cta: "Appel à l'action", image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1600&q=80" },
    services: { title: "Services", items: [{ title: "Service", text: "Description courte." }, { title: "Service", text: "Description courte." }, { title: "Service", text: "Description courte." }] },
    about: { title: "À propos", text: "Présentez l'entreprise.", image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80" },
    video: { title: "Vidéo", url: "https://www.youtube.com/watch?v=zyYgDtY2AMY" },
    gallery: { title: "Galerie", images: ["https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=70", "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=70", "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=70"] },
    cta: { title: "Prêt à commencer ?", button: "Nous écrire" },
    contact: { title: "Contact", address: "Adresse", phone: "Téléphone", email: "courriel@exemple.com" },
    footer: { brand: brand || "Marque", note: "Tous droits réservés." }
  };
  return section(type, map[type] || { title: type });
}
