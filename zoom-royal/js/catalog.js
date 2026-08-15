/* ── Zoom Royal · catalogue
   Pour ajouter un véhicule ou une vidéo : colle une URL YouTube, Vimeo ou MP4.
   Tu peux aussi le faire visuellement via le Studio (#/studio).
──────────────────────────────────────────────────────────── */

window.ZOOM_ROYAL = {
  brand: {
    name: "Zoom Royal",
    mark: "ZR",
    tagline: "Plus qu'une enchère. Une expérience.",
    established: "2026"
  },

  heroVideo: "https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4",
  heroPoster: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1920&q=80",

  featuredAuction: {
    id: "montreal-2026",
    kicker: "Prochaine enchère",
    city: "Montréal",
    year: "2026",
    dates: "12 – 14 septembre 2026",
    venue: "Palais des Congrès · Montréal, QC",
    status: "live",
    lots: 240,
    consignOpen: true
  },

  stats: [
    { value: "240+", label: "Lots à l'encan" },
    { value: "12 M$", label: "Ventes 2025" },
    { value: "100%", label: "Hammer aux œuvres" },
    { value: "3", label: "Villes cette saison" }
  ],

  events: [
    {
      id: "montreal-2026",
      city: "Montréal",
      dates: "12 – 14 septembre 2026",
      venue: "Palais des Congrès",
      status: "inscriptions",
      image: "https://images.unsplash.com/photo-1519677100203-a0e668c92439?auto=format&fit=crop&w=1400&q=80",
      blurb: "Le rendez-vous de la collection au Québec. Muscle cars, restomods et supercars — no reserve."
    },
    {
      id: "toronto-2026",
      city: "Toronto",
      dates: "6 – 8 novembre 2026",
      venue: "Enercare Centre",
      status: "consignations",
      image: "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1400&q=80",
      blurb: "Premier encan Zoom Royal en Ontario. Consignations ouvertes, lots select reserve."
    },
    {
      id: "quebec-2027",
      city: "Québec",
      dates: "22 – 24 janvier 2027",
      venue: "Centre Vidéotron",
      status: "bientôt",
      image: "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&w=1400&q=80",
      blurb: "Week-end d'hiver, block chauffé, automobilia et véhicules d'époque sous les projecteurs."
    }
  ],

  vehicles: [
    {
      id: "lot-1072",
      lot: "1072",
      year: 1969,
      make: "Chevrolet",
      model: "Camaro Z/28",
      subtitle: "Restomod 427 · matching-numbers body",
      noReserve: true,
      featured: true,
      auction: "montreal-2026",
      estimate: "185 000 – 220 000 $",
      images: [
        "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=zyYgDtY2AMY",
      specs: {
        Moteur: "427 ci V8",
        Transmission: "4 vitesses manuelle",
        Couleur: "Hugger Orange",
        Intérieur: "Noir houndstooth",
        Odomètre: "12 480 mi",
        Origine: "Detroit, MI"
      },
      description: "Un Z/28 repris à la base, châssis tubulaire, train avant indépendant et un 427 qui parle vrai. Carrosserie d'origine, peinture Hugger Orange, intérieur retravaillé. Prête pour le block — et pour la route."
    },
    {
      id: "lot-0881",
      lot: "0881",
      year: 1967,
      make: "Ford",
      model: "Mustang Shelby GT500",
      subtitle: "428 Police Interceptor · documented",
      noReserve: true,
      featured: true,
      auction: "montreal-2026",
      estimate: "240 000 – 280 000 $",
      images: [
        "https://images.unsplash.com/photo-1584345604476-8d5f13d7f1ba?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=Nzv1SLAvN2s",
      specs: {
        Moteur: "428 ci Police Interceptor",
        Transmission: "Toploader 4 vitesses",
        Couleur: "Nightmist Blue",
        Intérieur: "Noir deluxe",
        Odomètre: "51 200 mi"
      },
      description: "GT500 documentée, historique de restauration en dossier, numéros de caisse et de moteur vérifiés. Un des lots têtes d'affiche de Montréal."
    },
    {
      id: "lot-1244",
      lot: "1244",
      year: 1970,
      make: "Plymouth",
      model: "’Cuda 440",
      subtitle: "High Impact Lemon Twist · shaker hood",
      noReserve: true,
      featured: true,
      auction: "montreal-2026",
      estimate: "165 000 – 195 000 $",
      images: [
        "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4",
      specs: {
        Moteur: "440 ci Super Commando",
        Transmission: "727 TorqueFlite",
        Couleur: "Lemon Twist",
        Options: "Shaker, pistol-grip, Elastomeric"
      },
      description: "E-body d'époque, teinte High Impact, shaker et pistol-grip. Restauration complète, essai sur route au dossier."
    },
    {
      id: "lot-0519",
      lot: "0519",
      year: 1963,
      make: "Chevrolet",
      model: "Corvette Split-Window",
      subtitle: "Fuelie 327/360 · numbered",
      noReserve: false,
      featured: true,
      auction: "montreal-2026",
      estimate: "310 000 – 360 000 $",
      images: [
        "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=zyYgDtY2AMY",
      specs: {
        Moteur: "327/360 Fuel Injection",
        Transmission: "4 vitesses",
        Couleur: "Riverside Red",
        Particularité: "Split-window coupé"
      },
      description: "L'année unique du split-window. Fuelie 360, restauration concours, historique NCRS. Lot reserve — les enchères partiront haut."
    },
    {
      id: "lot-1330",
      lot: "1330",
      year: 1994,
      make: "Porsche",
      model: "911 Turbo 3.6",
      subtitle: "964 Turbo · Amazon Green",
      noReserve: true,
      featured: false,
      auction: "montreal-2026",
      estimate: "210 000 – 245 000 $",
      images: [
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=Nzv1SLAvN2s",
      specs: {
        Moteur: "3.6 L flat-six turbo",
        Puissance: "360 ch",
        Transmission: "5 vitesses manuelle",
        Couleur: "Amazon Green"
      },
      description: "964 Turbo dans une teinte rare, carnet Porsche, deux propriétaires. Le last analog 911 turbo avant l'ère 993."
    },
    {
      id: "lot-0777",
      lot: "0777",
      year: 1957,
      make: "Chevrolet",
      model: "Bel Air Convertible",
      subtitle: "283 Super Turbo-Fire · continental kit",
      noReserve: true,
      featured: false,
      auction: "toronto-2026",
      estimate: "92 000 – 118 000 $",
      images: [
        "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=zyYgDtY2AMY",
      specs: {
        Moteur: "283 ci V8",
        Transmission: "Powerglide",
        Couleur: "Matador Red / India Ivory"
      },
      description: "Tri-Five cabriolet, deux tons d'époque, continental kit et toits blancs. Un lot de foule, no reserve."
    },
    {
      id: "lot-2015",
      lot: "2015",
      year: 2022,
      make: "Ford",
      model: "GT ’66 Heritage",
      subtitle: "Heritage Edition · 1 of 50",
      noReserve: false,
      featured: true,
      auction: "montreal-2026",
      estimate: "1,2 – 1,4 M$",
      images: [
        "https://images.unsplash.com/photo-1617814076367-b759cfc43c25?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=zyYgDtY2AMY",
      specs: {
        Moteur: "3.5 L EcoBoost V6",
        Puissance: "660 ch",
        Production: "Heritage Edition",
        Livraison: "Ford GT garage"
      },
      description: "Hommage au GT40 de Le Mans 1966. Mileage de livraison, carnet et covers d'origine. Lot tête d'affiche, reserve."
    },
    {
      id: "lot-0440",
      lot: "0440",
      year: 1965,
      make: "Aston Martin",
      model: "DB5",
      subtitle: "LHD · Silver Birch · 5-speed",
      noReserve: false,
      featured: false,
      auction: "quebec-2027",
      estimate: "780 000 – 860 000 $",
      images: [
        "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=1600&q=80",
        "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?auto=format&fit=crop&w=1600&q=80"
      ],
      video: "https://www.youtube.com/watch?v=Nzv1SLAvN2s",
      specs: {
        Moteur: "4.0 L inline-six",
        Transmission: "5 vitesses ZF",
        Couleur: "Silver Birch",
        Direction: "LHD"
      },
      description: "La silhouette Bond. Restauration européenne, dossiers photo, essai moteur à froid filmé — voir la vidéo du lot."
    }
  ],

  media: [
    {
      id: "media-01",
      type: "video",
      title: "First look — lots têtes d'affiche, Montréal 2026",
      kicker: "Vidéo",
      duration: "4:12",
      video: "https://www.youtube.com/watch?v=zyYgDtY2AMY",
      image: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "media-02",
      type: "video",
      title: "SOLD — Ford GT Heritage traverse le block",
      kicker: "Encan",
      duration: "2:48",
      video: "https://www.youtube.com/watch?v=Nzv1SLAvN2s",
      image: "https://images.unsplash.com/photo-1617814076367-b759cfc43c25?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "media-03",
      type: "video",
      title: "Walkaround — ’Cuda Lemon Twist, shaker on",
      kicker: "Walkaround",
      duration: "6:05",
      video: "https://videos.pexels.com/video-files/3571264/3571264-uhd_2560_1440_30fps.mp4",
      image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=1200&q=80"
    },
    {
      id: "media-04",
      type: "article",
      title: "Comment consigner un muscle car au Québec",
      kicker: "Guide",
      image: "https://images.unsplash.com/photo-1489824904134-891ab64532f1?auto=format&fit=crop&w=1200&q=80",
      body: "Photos, historique, réserve ou no-reserve : le dossier qui fait monter la salle."
    },
    {
      id: "media-05",
      type: "news",
      title: "Zoom Royal ouvre les consignations Toronto",
      kicker: "Nouvelle",
      image: "https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80",
      body: "Lots no reserve et select reserve. Date limite de consignation : 15 septembre 2026."
    },
    {
      id: "media-06",
      type: "video",
      title: "Aftermovie — la salle, le marteau, la foule",
      kicker: "Aftermovie",
      duration: "3:30",
      video: "https://www.youtube.com/watch?v=Nzv1SLAvN2s",
      image: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80"
    }
  ]
};
