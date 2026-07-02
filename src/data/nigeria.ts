/**
 * Nigeria geo-hierarchy: State → LGA → Ward → Polling Unit.
 *
 * States and LGAs below are the real administrative units.
 * Wards and polling units are generated deterministically so the cascading
 * registration UX works end-to-end. When the official INEC / NIMC dataset is
 * connected, replace `getWards` / `getPollingUnits` with real lookups keyed on
 * the same (state, lga, ward) identifiers — no UI changes required.
 */

export interface NigerianState {
  name: string;
  capital: string;
  zone:
    | "North Central"
    | "North East"
    | "North West"
    | "South East"
    | "South South"
    | "South West";
  lgas: string[];
}

export const NIGERIA: NigerianState[] = [
  {
    name: "Abia",
    capital: "Umuahia",
    zone: "South East",
    lgas: [
      "Aba North", "Aba South", "Arochukwu", "Bende", "Ikwuano", "Isiala Ngwa North",
      "Isiala Ngwa South", "Isuikwuato", "Obi Ngwa", "Ohafia", "Osisioma", "Ugwunagbo",
      "Ukwa East", "Ukwa West", "Umuahia North", "Umuahia South", "Umu Nneochi",
    ],
  },
  {
    name: "Adamawa",
    capital: "Yola",
    zone: "North East",
    lgas: [
      "Demsa", "Fufure", "Ganye", "Gayuk", "Gombi", "Grie", "Hong", "Jada", "Lamurde",
      "Madagali", "Maiha", "Mayo Belwa", "Michika", "Mubi North", "Mubi South", "Numan",
      "Shelleng", "Song", "Toungo", "Yola North", "Yola South",
    ],
  },
  {
    name: "Akwa Ibom",
    capital: "Uyo",
    zone: "South South",
    lgas: [
      "Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo", "Etinan",
      "Ibeno", "Ibesikpo Asutan", "Ibiono-Ibom", "Ika", "Ikono", "Ikot Abasi", "Ikot Ekpene",
      "Ini", "Itu", "Mbo", "Mkpat-Enin", "Nsit-Atai", "Nsit-Ibom", "Nsit-Ubium", "Obot Akara",
      "Okobo", "Onna", "Oron", "Oruk Anam", "Udung-Uko", "Ukanafun", "Uruan", "Urue-Offong/Oruko", "Uyo",
    ],
  },
  {
    name: "Anambra",
    capital: "Awka",
    zone: "South East",
    lgas: [
      "Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North", "Awka South",
      "Ayamelum", "Dunukofia", "Ekwusigo", "Idemili North", "Idemili South", "Ihiala",
      "Njikoka", "Nnewi North", "Nnewi South", "Ogbaru", "Onitsha North", "Onitsha South",
      "Orumba North", "Orumba South", "Oyi",
    ],
  },
  {
    name: "Bauchi",
    capital: "Bauchi",
    zone: "North East",
    lgas: [
      "Alkaleri", "Bauchi", "Bogoro", "Damban", "Darazo", "Dass", "Gamawa", "Ganjuwa",
      "Giade", "Itas/Gadau", "Jama'are", "Katagum", "Kirfi", "Misau", "Ningi", "Shira",
      "Tafawa Balewa", "Toro", "Warji", "Zaki",
    ],
  },
  {
    name: "Bayelsa",
    capital: "Yenagoa",
    zone: "South South",
    lgas: [
      "Brass", "Ekeremor", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Sagbama", "Southern Ijaw", "Yenagoa",
    ],
  },
  {
    name: "Benue",
    capital: "Makurdi",
    zone: "North Central",
    lgas: [
      "Ado", "Agatu", "Apa", "Buruku", "Gboko", "Guma", "Gwer East", "Gwer West", "Katsina-Ala",
      "Konshisha", "Kwande", "Logo", "Makurdi", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu",
      "Otukpo", "Tarka", "Ukum", "Ushongo", "Vandeikya",
    ],
  },
  {
    name: "Borno",
    capital: "Maiduguri",
    zone: "North East",
    lgas: [
      "Abadam", "Askira/Uba", "Bama", "Bayo", "Biu", "Chibok", "Damboa", "Dikwa", "Gubio",
      "Guzamala", "Gwoza", "Hawul", "Jere", "Kaga", "Kala/Balge", "Konduga", "Kukawa",
      "Kwaya Kusar", "Mafa", "Magumeri", "Maiduguri", "Marte", "Mobbar", "Monguno", "Ngala",
      "Nganzai", "Shani",
    ],
  },
  {
    name: "Cross River",
    capital: "Calabar",
    zone: "South South",
    lgas: [
      "Abi", "Akamkpa", "Akpabuyo", "Bakassi", "Bekwarra", "Biase", "Boki", "Calabar Municipal",
      "Calabar South", "Etung", "Ikom", "Obanliku", "Obubra", "Obudu", "Odukpani", "Ogoja",
      "Yakurr", "Yala",
    ],
  },
  {
    name: "Delta",
    capital: "Asaba",
    zone: "South South",
    lgas: [
      "Aniocha North", "Aniocha South", "Bomadi", "Burutu", "Ethiope East", "Ethiope West",
      "Ika North East", "Ika South", "Isoko North", "Isoko South", "Ndokwa East", "Ndokwa West",
      "Okpe", "Oshimili North", "Oshimili South", "Patani", "Sapele", "Udu", "Ughelli North",
      "Ughelli South", "Ukwuani", "Uvwie", "Warri North", "Warri South", "Warri South West",
    ],
  },
  {
    name: "Ebonyi",
    capital: "Abakaliki",
    zone: "South East",
    lgas: [
      "Abakaliki", "Afikpo North", "Afikpo South", "Ebonyi", "Ezza North", "Ezza South",
      "Ikwo", "Ishielu", "Ivo", "Izzi", "Ohaozara", "Ohaukwu", "Onicha",
    ],
  },
  {
    name: "Edo",
    capital: "Benin City",
    zone: "South South",
    lgas: [
      "Akoko-Edo", "Egor", "Esan Central", "Esan North-East", "Esan South-East", "Esan West",
      "Etsako Central", "Etsako East", "Etsako West", "Igueben", "Ikpoba Okha", "Oredo",
      "Orhionmwon", "Ovia North-East", "Ovia South-West", "Owan East", "Owan West", "Uhunmwonde",
    ],
  },
  {
    name: "Ekiti",
    capital: "Ado Ekiti",
    zone: "South West",
    lgas: [
      "Ado Ekiti", "Efon", "Ekiti East", "Ekiti South-West", "Ekiti West", "Emure", "Gbonyin",
      "Ido Osi", "Ijero", "Ikere", "Ikole", "Ilejemeje", "Irepodun/Ifelodun", "Ise/Orun",
      "Moba", "Oye",
    ],
  },
  {
    name: "Enugu",
    capital: "Enugu",
    zone: "South East",
    lgas: [
      "Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Ezeagu", "Igbo Etiti",
      "Igbo Eze North", "Igbo Eze South", "Isi Uzo", "Nkanu East", "Nkanu West", "Nsukka",
      "Oji River", "Udenu", "Udi", "Uzo Uwani",
    ],
  },
  {
    name: "Gombe",
    capital: "Gombe",
    zone: "North East",
    lgas: [
      "Akko", "Balanga", "Billiri", "Dukku", "Funakaye", "Gombe", "Kaltungo", "Kwami",
      "Nafada", "Shongom", "Yamaltu/Deba",
    ],
  },
  {
    name: "Imo",
    capital: "Owerri",
    zone: "South East",
    lgas: [
      "Aboh Mbaise", "Ahiazu Mbaise", "Ehime Mbano", "Ezinihitte", "Ideato North", "Ideato South",
      "Ihitte/Uboma", "Ikeduru", "Isiala Mbano", "Isu", "Mbaitoli", "Ngor Okpala", "Njaba",
      "Nkwerre", "Nwangele", "Obowo", "Oguta", "Ohaji/Egbema", "Okigwe", "Orlu", "Orsu",
      "Oru East", "Oru West", "Owerri Municipal", "Owerri North", "Owerri West", "Unuimo",
    ],
  },
  {
    name: "Jigawa",
    capital: "Dutse",
    zone: "North West",
    lgas: [
      "Auyo", "Babura", "Biriniwa", "Birnin Kudu", "Buji", "Dutse", "Gagarawa", "Garki",
      "Gumel", "Guri", "Gwaram", "Gwiwa", "Hadejia", "Jahun", "Kafin Hausa", "Kaugama",
      "Kazaure", "Kiri Kasama", "Kiyawa", "Maigatari", "Malam Madori", "Miga", "Ringim",
      "Roni", "Sule Tankarkar", "Taura", "Yankwashi",
    ],
  },
  {
    name: "Kaduna",
    capital: "Kaduna",
    zone: "North West",
    lgas: [
      "Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba", "Jema'a", "Kachia",
      "Kaduna North", "Kaduna South", "Kagarko", "Kajuru", "Kaura", "Kauru", "Kubau",
      "Kudan", "Lere", "Makarfi", "Sabon Gari", "Sanga", "Soba", "Zangon Kataf", "Zaria",
    ],
  },
  {
    name: "Kano",
    capital: "Kano",
    zone: "North West",
    lgas: [
      "Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi", "Bunkure", "Dala", "Dambatta",
      "Dawakin Kudu", "Dawakin Tofa", "Doguwa", "Fagge", "Gabasawa", "Garko", "Garun Mallam",
      "Gaya", "Gezawa", "Gwale", "Gwarzo", "Kabo", "Kano Municipal", "Karaye", "Kibiya",
      "Kiru", "Kumbotso", "Kunchi", "Kura", "Madobi", "Makoda", "Minjibir", "Nasarawa",
      "Rano", "Rimin Gado", "Rogo", "Shanono", "Sumaila", "Takai", "Tarauni", "Tofa",
      "Tsanyawa", "Tudun Wada", "Ungogo", "Warawa", "Wudil",
    ],
  },
  {
    name: "Katsina",
    capital: "Katsina",
    zone: "North West",
    lgas: [
      "Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi", "Dandume",
      "Danja", "Dan Musa", "Daura", "Dutsi", "Dutsin Ma", "Faskari", "Funtua", "Ingawa",
      "Jibia", "Kafur", "Kaita", "Kankara", "Kankia", "Katsina", "Kurfi", "Kusada",
      "Mai'Adua", "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa", "Rimi", "Sabuwa",
      "Safana", "Sandamu", "Zango",
    ],
  },
  {
    name: "Kebbi",
    capital: "Birnin Kebbi",
    zone: "North West",
    lgas: [
      "Aleiro", "Arewa Dandi", "Argungu", "Augie", "Bagudo", "Birnin Kebbi", "Bunza",
      "Dandi", "Fakai", "Gwandu", "Jega", "Kalgo", "Koko/Besse", "Maiyama", "Ngaski",
      "Sakaba", "Shanga", "Suru", "Wasagu/Danko", "Yauri", "Zuru",
    ],
  },
  {
    name: "Kogi",
    capital: "Lokoja",
    zone: "North Central",
    lgas: [
      "Adavi", "Ajaokuta", "Ankpa", "Bassa", "Dekina", "Ibaji", "Idah", "Igalamela Odolu",
      "Ijumu", "Kabba/Bunu", "Kogi", "Lokoja", "Mopa Muro", "Ofu", "Ogori/Magongo", "Okehi",
      "Okene", "Olamaboro", "Omala", "Yagba East", "Yagba West",
    ],
  },
  {
    name: "Kwara",
    capital: "Ilorin",
    zone: "North Central",
    lgas: [
      "Asa", "Baruten", "Edu", "Ekiti", "Ifelodun", "Ilorin East", "Ilorin South",
      "Ilorin West", "Irepodun", "Isin", "Kaiama", "Moro", "Offa", "Oke Ero", "Oyun", "Pategi",
    ],
  },
  {
    name: "Lagos",
    capital: "Ikeja",
    zone: "South West",
    lgas: [
      "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa", "Badagry", "Epe",
      "Eti Osa", "Ibeju-Lekki", "Ifako-Ijaiye", "Ikeja", "Ikorodu", "Kosofe", "Lagos Island",
      "Lagos Mainland", "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere",
    ],
  },
  {
    name: "Nasarawa",
    capital: "Lafia",
    zone: "North Central",
    lgas: [
      "Akwanga", "Awe", "Doma", "Karu", "Keana", "Keffi", "Kokona", "Lafia", "Nasarawa",
      "Nasarawa Egon", "Obi", "Toto", "Wamba",
    ],
  },
  {
    name: "Niger",
    capital: "Minna",
    zone: "North Central",
    lgas: [
      "Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati", "Gbako", "Gurara",
      "Katcha", "Kontagora", "Lapai", "Lavun", "Magama", "Mariga", "Mashegu", "Mokwa",
      "Moya", "Paikoro", "Rafi", "Rijau", "Shiroro", "Suleja", "Tafa", "Wushishi",
    ],
  },
  {
    name: "Ogun",
    capital: "Abeokuta",
    zone: "South West",
    lgas: [
      "Abeokuta North", "Abeokuta South", "Ado-Odo/Ota", "Egbado North", "Egbado South",
      "Ewekoro", "Ifo", "Ijebu East", "Ijebu North", "Ijebu North East", "Ijebu Ode",
      "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode", "Odeda", "Odogbolu", "Ogun Waterside",
      "Remo North", "Sagamu",
    ],
  },
  {
    name: "Ondo",
    capital: "Akure",
    zone: "South West",
    lgas: [
      "Akoko North-East", "Akoko North-West", "Akoko South-East", "Akoko South-West", "Akure North",
      "Akure South", "Ese Odo", "Idanre", "Ifedore", "Ilaje", "Ile Oluji/Okeigbo", "Irele",
      "Odigbo", "Okitipupa", "Ondo East", "Ondo West", "Ose", "Owo",
    ],
  },
  {
    name: "Osun",
    capital: "Osogbo",
    zone: "South West",
    lgas: [
      "Aiyedaade", "Aiyedire", "Atakunmosa East", "Atakunmosa West", "Boluwaduro", "Boripe",
      "Ede North", "Ede South", "Egbedore", "Ejigbo", "Ife Central", "Ife East", "Ife North",
      "Ife South", "Ifedayo", "Ifelodun", "Ila", "Ilesa East", "Ilesa West", "Irepodun",
      "Irewole", "Isokan", "Iwo", "Obokun", "Odo Otin", "Ola Oluwa", "Olorunda", "Oriade",
      "Orolu", "Osogbo",
    ],
  },
  {
    name: "Oyo",
    capital: "Ibadan",
    zone: "South West",
    lgas: [
      "Afijio", "Akinyele", "Atiba", "Atisbo", "Egbeda", "Ibadan North", "Ibadan North-East",
      "Ibadan North-West", "Ibadan South-East", "Ibadan South-West", "Ibarapa Central",
      "Ibarapa East", "Ibarapa North", "Ido", "Irepo", "Iseyin", "Itesiwaju", "Iwajowa",
      "Kajola", "Lagelu", "Ogbomosho North", "Ogbomosho South", "Ogo Oluwa", "Olorunsogo",
      "Oluyole", "Ona Ara", "Orelope", "Ori Ire", "Oyo East", "Oyo West", "Saki East",
      "Saki West", "Surulere",
    ],
  },
  {
    name: "Plateau",
    capital: "Jos",
    zone: "North Central",
    lgas: [
      "Barkin Ladi", "Bassa", "Bokkos", "Jos East", "Jos North", "Jos South", "Kanam",
      "Kanke", "Langtang North", "Langtang South", "Mangu", "Mikang", "Pankshin", "Qua'an Pan",
      "Riyom", "Shendam", "Wase",
    ],
  },
  {
    name: "Rivers",
    capital: "Port Harcourt",
    zone: "South South",
    lgas: [
      "Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru", "Andoni", "Asari-Toru",
      "Bonny", "Degema", "Eleme", "Emohua", "Etche", "Gokana", "Ikwerre", "Khana", "Obio/Akpor",
      "Ogba/Egbema/Ndoni", "Ogu/Bolo", "Okrika", "Omuma", "Opobo/Nkoro", "Oyigbo",
      "Port Harcourt", "Tai",
    ],
  },
  {
    name: "Sokoto",
    capital: "Sokoto",
    zone: "North West",
    lgas: [
      "Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu", "Gwadabawa", "Illela",
      "Isa", "Kebbe", "Kware", "Rabah", "Sabon Birni", "Shagari", "Silame", "Sokoto North",
      "Sokoto South", "Tambuwal", "Tangaza", "Tureta", "Wamako", "Wurno", "Yabo",
    ],
  },
  {
    name: "Taraba",
    capital: "Jalingo",
    zone: "North East",
    lgas: [
      "Ardo Kola", "Bali", "Donga", "Gashaka", "Gassol", "Ibi", "Jalingo", "Karim Lamido",
      "Kumi", "Lau", "Sardauna", "Takum", "Ussa", "Wukari", "Yorro", "Zing",
    ],
  },
  {
    name: "Yobe",
    capital: "Damaturu",
    zone: "North East",
    lgas: [
      "Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba", "Gulani", "Jakusko",
      "Karasuwa", "Machina", "Nangere", "Nguru", "Potiskum", "Tarmuwa", "Yunusari", "Yusufari",
    ],
  },
  {
    name: "Zamfara",
    capital: "Gusau",
    zone: "North West",
    lgas: [
      "Anka", "Bakura", "Birnin Magaji/Kiyaw", "Bukkuyum", "Bungudu", "Gummi", "Gusau",
      "Kaura Namoda", "Maradun", "Maru", "Shinkafi", "Talata Mafara", "Chafe", "Zurmi",
    ],
  },
  {
    name: "FCT - Abuja",
    capital: "Abuja",
    zone: "North Central",
    lgas: ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal Area Council"],
  },
];

/* ------------------------------------------------------------------ */
/* Deterministic ward / polling-unit generation (placeholder dataset) */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const WARD_SUFFIXES = [
  "Central", "North", "South", "East", "West", "Township", "Market", "Sabon Gari",
  "Tudun Wada", "Old Town", "New Layout", "Garki", "Wuro", "Anguwan Sarki",
];

/** Returns the wards for a given LGA (8–12 wards, stable per LGA). */
export function getWards(state: string, lga: string): string[] {
  const seed = hash(`${state}|${lga}`);
  const count = 8 + (seed % 5); // 8..12
  return Array.from({ length: count }, (_, i) => {
    const label = WARD_SUFFIXES[(seed + i) % WARD_SUFFIXES.length];
    const code = String(i + 1).padStart(2, "0");
    return `Ward ${code} — ${lga} ${label}`;
  });
}

/** Returns the polling units for a given ward (6–14 units, stable per ward). */
export function getPollingUnits(state: string, lga: string, ward: string): string[] {
  const seed = hash(`${state}|${lga}|${ward}`);
  const count = 6 + (seed % 9); // 6..14
  const wardNo = ward.match(/Ward (\d+)/)?.[1] ?? "01";
  return Array.from({ length: count }, (_, i) => {
    const pu = String(i + 1).padStart(3, "0");
    return `PU ${wardNo}/${pu} — ${ward.split("—")[1]?.trim() ?? lga}`;
  });
}

export const STATE_NAMES = NIGERIA.map((s) => s.name);

export function getLgas(state: string): string[] {
  return NIGERIA.find((s) => s.name === state)?.lgas ?? [];
}
