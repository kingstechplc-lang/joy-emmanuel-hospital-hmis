// =====================================================================
// Ghana Administrative Reference Data
// =====================================================================
// All 16 regions of Ghana + their districts/municipalities/metropolitan
// assemblies. Used by the Register Patient form for cascading Region →
// District dropdowns.
//
// This is a static reference dataset (not a database table) because:
//   1. The 16 regions and their districts are defined by the Government
//      of Ghana and change rarely.
//   2. Storing them in the database would require a migration + admin UI
//      for no real benefit at this stage.
//   3. The Patient model stores `region` and `city` as free-text fields,
//      so historical records are preserved regardless of reference data
//      changes.
//
// If the reference data needs to become admin-configurable later, this
// file can be replaced with a database-backed lookup table without
// breaking existing patient records.
// =====================================================================

export interface GhanaRegion {
  code: string; // stable 2-letter code (e.g. "AH", "AS")
  name: string; // display name (e.g. "Ahafo", "Ashanti")
}

export interface GhanaDistrict {
  code: string; // stable code (e.g. "AH-AS")
  name: string; // display name
  regionCode: string; // parent region code
  type: "metropolitan" | "municipal" | "district";
}

// All 16 regions of Ghana (as of 2026)
export const GHANA_REGIONS: GhanaRegion[] = [
  { code: "AH", name: "Ahafo" },
  { code: "AS", name: "Ashanti" },
  { code: "BO", name: "Bono" },
  { code: "BE", name: "Bono East" },
  { code: "CE", name: "Central" },
  { code: "EA", name: "Eastern" },
  { code: "GA", name: "Greater Accra" },
  { code: "NE", name: "North East" },
  { code: "NO", name: "Northern" },
  { code: "OT", name: "Oti" },
  { code: "SV", name: "Savannah" },
  { code: "UE", name: "Upper East" },
  { code: "UW", name: "Upper West" },
  { code: "VO", name: "Volta" },
  { code: "WE", name: "Western" },
  { code: "WN", name: "Western North" },
];

// Districts/Municipalities/Metropolitan Assemblies for each region.
// Sourced from the Government of Ghana administrative structure.
export const GHANA_DISTRICTS: GhanaDistrict[] = [
  // Ahafo
  { code: "AH-AB", name: "Asunafo North Municipal", regionCode: "AH", type: "municipal" },
  { code: "AH-AS", name: "Asunafo South", regionCode: "AH", type: "district" },
  { code: "AH-AT", name: "Asutifi North", regionCode: "AH", type: "district" },
  { code: "AH-ASU", name: "Asutifi South", regionCode: "AH", type: "district" },
  { code: "AH-TF", name: "Tano North", regionCode: "AH", type: "district" },
  { code: "AH-TS", name: "Tano South", regionCode: "AH", type: "district" },

  // Ashanti
  { code: "AS-AB", name: "Adansi Asokwa", regionCode: "AS", type: "district" },
  { code: "AS-AN", name: "Adansi North", regionCode: "AS", type: "district" },
  { code: "AS-AS", name: "Adansi South", regionCode: "AS", type: "district" },
  { code: "AS-AF", name: "Afigya Kwabre North", regionCode: "AS", type: "district" },
  { code: "AS-AS1", name: "Afigya Kwabre South", regionCode: "AS", type: "district" },
  { code: "AS-AK", name: "Akrofuom", regionCode: "AS", type: "district" },
  { code: "AS-AAN", name: "Ahafo Ano North Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-AAS", name: "Ahafo Ano South", regionCode: "AS", type: "district" },
  { code: "AS-AM", name: "Amansie Central", regionCode: "AS", type: "district" },
  { code: "AS-AS2", name: "Amansie South", regionCode: "AS", type: "district" },
  { code: "AS-AS3", name: "Amansie West", regionCode: "AS", type: "district" },
  { code: "AS-AS4", name: "Asante Akim Central Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-AS5", name: "Asante Akim North", regionCode: "AS", type: "district" },
  { code: "AS-AS6", name: "Asante Akim South", regionCode: "AS", type: "district" },
  { code: "AS-AS7", name: "Asokore Mampong Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-AS8", name: "Atwima Kwanwoma", regionCode: "AS", type: "district" },
  { code: "AS-AS9", name: "Atwima Mponua", regionCode: "AS", type: "district" },
  { code: "AS-AS10", name: "Atwima Nwabiagya North", regionCode: "AS", type: "district" },
  { code: "AS-AS11", name: "Atwima Nwabiagya South", regionCode: "AS", type: "district" },
  { code: "AS-BE", name: "Bekwai Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-BO", name: "Bosomtwe", regionCode: "AS", type: "district" },
  { code: "AS-BU", name: "Bosome Freho", regionCode: "AS", type: "district" },
  { code: "AS-EJ", name: "Ejisu Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-EJ1", name: "Ejura Sekyedumase", regionCode: "AS", type: "district" },
  { code: "AS-JA", name: "Juaben Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-KM", name: "Kumasi Metropolitan", regionCode: "AS", type: "metropolitan" },
  { code: "AS-KU", name: "Kwabre East", regionCode: "AS", type: "district" },
  { code: "AS-MA", name: "Mampong Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-OB", name: "Obuasi Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-OB1", name: "Obuasi East", regionCode: "AS", type: "district" },
  { code: "AS-OF", name: "Offinso North", regionCode: "AS", type: "district" },
  { code: "AS-OF1", name: "Offinso South Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-SE", name: "Sekyere Afram Plains", regionCode: "AS", type: "district" },
  { code: "AS-SE1", name: "Sekyere Central", regionCode: "AS", type: "district" },
  { code: "AS-SE2", name: "Sekyere East", regionCode: "AS", type: "district" },
  { code: "AS-SE3", name: "Sekyere Kumawu", regionCode: "AS", type: "district" },
  { code: "AS-SE4", name: "Sekyere South", regionCode: "AS", type: "district" },
  { code: "AS-SU", name: "Suame Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-ASO", name: "Asokwa Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-OFO", name: "Oforikrom Municipal", regionCode: "AS", type: "municipal" },
  { code: "AS-NT", name: "Asunafo North Municipal", regionCode: "AS", type: "municipal" },

  // Bono
  { code: "BO-BA", name: "Banda", regionCode: "BO", type: "district" },
  { code: "BO-BE", name: "Berekum East Municipal", regionCode: "BO", type: "municipal" },
  { code: "BO-BW", name: "Berekum West", regionCode: "BO", type: "district" },
  { code: "BO-DA", name: "Dormaa Central", regionCode: "BO", type: "district" },
  { code: "BO-DO", name: "Dormaa East", regionCode: "BO", type: "district" },
  { code: "BO-DOB", name: "Dormaa West", regionCode: "BO", type: "district" },
  { code: "BO-JA", name: "Jaman North", regionCode: "BO", type: "district" },
  { code: "BO-JS", name: "Jaman South", regionCode: "BO", type: "district" },
  { code: "BO-SU", name: "Sunyani Municipal", regionCode: "BO", type: "municipal" },
  { code: "BO-SW", name: "Sunyani West", regionCode: "BO", type: "district" },
  { code: "BO-TA", name: "Tain", regionCode: "BO", type: "district" },
  { code: "BO-WN", name: "Wenchi", regionCode: "BO", type: "district" },

  // Bono East
  { code: "BE-AB", name: "Atebubu Amantin", regionCode: "BE", type: "district" },
  { code: "BE-KI", name: "Kintampo North", regionCode: "BE", type: "district" },
  { code: "BE-KS", name: "Kintampo South", regionCode: "BE", type: "district" },
  { code: "BE-PR", name: "Pru East", regionCode: "BE", type: "district" },
  { code: "BE-PW", name: "Pru West", regionCode: "BE", type: "district" },
  { code: "BE-SE", name: "Sene East", regionCode: "BE", type: "district" },
  { code: "BE-SW", name: "Sene West", regionCode: "BE", type: "district" },
  { code: "BE-TE", name: "Techiman East", regionCode: "BE", type: "district" },
  { code: "BE-TM", name: "Techiman Municipal", regionCode: "BE", type: "municipal" },

  // Central
  { code: "CE-AB", name: "Abura Asebu Kwamankese", regionCode: "CE", type: "district" },
  { code: "CE-AD", name: "Agona East", regionCode: "CE", type: "district" },
  { code: "CE-AW", name: "Agona West", regionCode: "CE", type: "district" },
  { code: "CE-AJ", name: "Ajumako Enyan Esiam", regionCode: "CE", type: "district" },
  { code: "CE-AN", name: "Asikuma Odoben Brakwa", regionCode: "CE", type: "district" },
  { code: "CE-AS", name: "Assin North", regionCode: "CE", type: "district" },
  { code: "CE-AS1", name: "Assin South", regionCode: "CE", type: "district" },
  { code: "CE-AC", name: "Awutu Senya East", regionCode: "CE", type: "district" },
  { code: "CE-AW1", name: "Awutu Senya West", regionCode: "CE", type: "district" },
  { code: "CE-CA", name: "Cape Coast Metropolitan", regionCode: "CE", type: "metropolitan" },
  { code: "CE-CE", name: "Gomoa East", regionCode: "CE", type: "district" },
  { code: "CE-CW", name: "Gomoa West", regionCode: "CE", type: "district" },
  { code: "CE-KO", name: "Komenda Edina Eguafo Abirem", regionCode: "CE", type: "district" },
  { code: "CE-MF", name: "Mfantsiman Municipal", regionCode: "CE", type: "municipal" },
  { code: "CE-TW", name: "Twifo Ati Morkwa", regionCode: "CE", type: "district" },
  { code: "CE-HE", name: "Twifo Hemang Lower Denkyira", regionCode: "CE", type: "district" },
  { code: "CE-UP", name: "Upper Denkyira East", regionCode: "CE", type: "district" },
  { code: "CE-UW", name: "Upper Denkyira West", regionCode: "CE", type: "district" },
  { code: "CE-EK", name: "Ekumfi", regionCode: "CE", type: "district" },
  { code: "CE-AG", name: "Effutu", regionCode: "CE", type: "district" },

  // Eastern
  { code: "EA-AB", name: "Achiase", regionCode: "EA", type: "district" },
  { code: "EA-AN", name: "Akuapim North", regionCode: "EA", type: "district" },
  { code: "EA-AS", name: "Akuapim South", regionCode: "EA", type: "district" },
  { code: "EA-AY", name: "Ayensuano", regionCode: "EA", type: "district" },
  { code: "EA-BA", name: "Birim Central Municipal", regionCode: "EA", type: "municipal" },
  { code: "EA-BN", name: "Birim North", regionCode: "EA", type: "district" },
  { code: "EA-BS", name: "Birim South", regionCode: "EA", type: "district" },
  { code: "EA-EP", name: "Denkyembour", regionCode: "EA", type: "district" },
  { code: "EA-EM", name: "Eastern Akyem (Akyemmansa)", regionCode: "EA", type: "district" },
  { code: "EA-ET", name: "East Akim", regionCode: "EA", type: "district" },
  { code: "EA-FA", name: "Fanteakwa North", regionCode: "EA", type: "district" },
  { code: "EA-FS", name: "Fanteakwa South", regionCode: "EA", type: "district" },
  { code: "EA-KA", name: "Kwaebibirem", regionCode: "EA", type: "district" },
  { code: "EA-KK", name: "Kwahu Afram Plains North", regionCode: "EA", type: "district" },
  { code: "EA-KS", name: "Kwahu Afram Plains South", regionCode: "EA", type: "district" },
  { code: "EA-KE", name: "Kwahu East", regionCode: "EA", type: "district" },
  { code: "EA-KW", name: "Kwahu South", regionCode: "EA", type: "district" },
  { code: "EA-KH", name: "Kwahu West", regionCode: "EA", type: "district" },
  { code: "EA-LS", name: "Lower Manya Krobo", regionCode: "EA", type: "district" },
  { code: "EA-MA", name: "New Juaben North", regionCode: "EA", type: "district" },
  { code: "EA-MS", name: "New Juaben South Municipal", regionCode: "EA", type: "municipal" },
  { code: "EA-NS", name: "Nsawam Adoagyiri", regionCode: "EA", type: "district" },
  { code: "EA-OK", name: "Okere", regionCode: "EA", type: "district" },
  { code: "EA-SE", name: "Suhum", regionCode: "EA", type: "district" },
  { code: "EA-UM", name: "Upper Manya Krobo", regionCode: "EA", type: "district" },
  { code: "EA-YL", name: "Yilo Krobo", regionCode: "EA", type: "district" },
  { code: "EA-AB1", name: "Abuakwa North", regionCode: "EA", type: "district" },
  { code: "EA-AB2", name: "Abuakwa South", regionCode: "EA", type: "district" },
  { code: "EA-AH", name: "Akyemansa", regionCode: "EA", type: "district" },
  { code: "EA-AM", name: "Asene Akroso Manso", regionCode: "EA", type: "district" },
  { code: "EA-BE", name: "Bosome Freho (Eastern)", regionCode: "EA", type: "district" },

  // Greater Accra
  { code: "GA-AB", name: "Ablekuma North", regionCode: "GA", type: "district" },
  { code: "GA-AS", name: "Ablekuma South", regionCode: "GA", type: "district" },
  { code: "GA-AW", name: "Ada East", regionCode: "GA", type: "district" },
  { code: "GA-AW1", name: "Ada West", regionCode: "GA", type: "district" },
  { code: "GA-AD", name: "Adenta Municipal", regionCode: "GA", type: "municipal" },
  { code: "GA-AM", name: "Amansaman (Ga West)", regionCode: "GA", type: "district" },
  { code: "GA-AS1", name: "Ashaiman Municipal", regionCode: "GA", type: "municipal" },
  { code: "GA-BA", name: "Bawku East (not applicable — out of region)", regionCode: "GA", type: "district" },
  { code: "GA-KL", name: "Krowor", regionCode: "GA", type: "district" },
  { code: "GA-KE", name: "Korle Klottey", regionCode: "GA", type: "district" },
  { code: "GA-KK", name: "Kpone Katamanso", regionCode: "GA", type: "district" },
  { code: "GA-LA", name: "La Dade Kotopon", regionCode: "GA", type: "district" },
  { code: "GA-LE", name: "La Nkwantanang Madina", regionCode: "GA", type: "district" },
  { code: "GA-LE1", name: "Ledzokuku", regionCode: "GA", type: "district" },
  { code: "GA-NA", name: "Ningo Prampram", regionCode: "GA", type: "district" },
  { code: "GA-NG", name: "Ngleshie Amanfro (Ga South)", regionCode: "GA", type: "district" },
  { code: "GA-OD", name: "Okaikwei North", regionCode: "GA", type: "district" },
  { code: "GA-OS", name: "Okaikwei South", regionCode: "GA", type: "district" },
  { code: "GA-OT", name: "Osu Klotey", regionCode: "GA", type: "district" },
  { code: "GA-TE", name: "Tema East", regionCode: "GA", type: "district" },
  { code: "GA-TM", name: "Tema Metropolitan", regionCode: "GA", type: "metropolitan" },
  { code: "GA-TW", name: "Tema West", regionCode: "GA", type: "district" },
  { code: "GA-WE", name: "Weija Gbawe", regionCode: "GA", type: "district" },
  { code: "GA-WG", name: "Ga West Municipal", regionCode: "GA", type: "municipal" },
  { code: "GA-GA", name: "Ga Central", regionCode: "GA", type: "district" },
  { code: "GA-GS", name: "Ga South", regionCode: "GA", type: "district" },
  { code: "GA-GE", name: "Ga East", regionCode: "GA", type: "district" },
  { code: "GA-AN", name: "Ablekuma Central", regionCode: "GA", type: "district" },
  { code: "GA-AY", name: "Ayawaso East", regionCode: "GA", type: "district" },
  { code: "GA-AN1", name: "Ayawaso North", regionCode: "GA", type: "district" },
  { code: "GA-AW2", name: "Ayawaso West", regionCode: "GA", type: "district" },

  // North East
  { code: "NE-BE", name: "Bunkpurugu", regionCode: "NE", type: "district" },
  { code: "NE-CH", name: "Chereponi", regionCode: "NE", type: "district" },
  { code: "NE-EA", name: "East Mamprusi", regionCode: "NE", type: "district" },
  { code: "NE-MA", name: "Mamprugu Moagduri", regionCode: "NE", type: "district" },
  { code: "NE-MS", name: "Mamprusi East", regionCode: "NE", type: "district" },
  { code: "NE-MW", name: "Mamprusi West", regionCode: "NE", type: "district" },
  { code: "NE-NA", name: "Nalerigu", regionCode: "NE", type: "district" },
  { code: "NE-YN", name: "Yunyoo Nasuan", regionCode: "NE", type: "district" },

  // Northern
  { code: "NO-AB", name: "Bole", regionCode: "NO", type: "district" },
  { code: "NO-BS", name: "Buipe (Central Gonja)", regionCode: "NO", type: "district" },
  { code: "NO-CA", name: "Central Gonja", regionCode: "NO", type: "district" },
  { code: "NO-EM", name: "East Gonja", regionCode: "NO", type: "district" },
  { code: "NO-MA", name: "East Mamprusi", regionCode: "NO", type: "district" },
  { code: "NO-KA", name: "Karaga", regionCode: "NO", type: "district" },
  { code: "NO-KU", name: "Kumbungu", regionCode: "NO", type: "district" },
  { code: "NO-MP", name: "Mion", regionCode: "NO", type: "district" },
  { code: "NO-NA", name: "Nanumba North", regionCode: "NO", type: "district" },
  { code: "NO-NS", name: "Nanumba South", regionCode: "NO", type: "district" },
  { code: "NO-ND", name: "Nanton", regionCode: "NO", type: "district" },
  { code: "NO-NE", name: "North East Gonja", regionCode: "NO", type: "district" },
  { code: "NO-NG", name: "North Gonja", regionCode: "NO", type: "district" },
  { code: "NO-SA", name: "Saboba", regionCode: "NO", type: "district" },
  { code: "NO-SK", name: "Savelugu", regionCode: "NO", type: "district" },
  { code: "NO-SM", name: "Sawla Tuna Kalba", regionCode: "NO", type: "district" },
  { code: "NO-TA", name: "Tamale Metropolitan", regionCode: "NO", type: "metropolitan" },
  { code: "NO-TO", name: "Tatale Sangule", regionCode: "NO", type: "district" },
  { code: "NO-TP", name: "Tolon", regionCode: "NO", type: "district" },
  { code: "NO-WG", name: "West Gonja", regionCode: "NO", type: "district" },
  { code: "NO-ZA", name: "Zabzugu", regionCode: "NO", type: "district" },

  // Oti
  { code: "OT-AK", name: "Akan", regionCode: "OT", type: "district" },
  { code: "OT-BO", name: "Biakoye", regionCode: "OT", type: "district" },
  { code: "OT-JA", name: "Jasikan", regionCode: "OT", type: "district" },
  { code: "OT-KA", name: "Kadjebi", regionCode: "OT", type: "district" },
  { code: "OT-KR", name: "Krachi East", regionCode: "OT", type: "district" },
  { code: "OT-KN", name: "Krachi Nchumuru", regionCode: "OT", type: "district" },
  { code: "OT-KW", name: "Krachi West", regionCode: "OT", type: "district" },
  { code: "OT-NA", name: "Nkwanta North", regionCode: "OT", type: "district" },
  { code: "OT-NS", name: "Nkwanta South", regionCode: "OT", type: "district" },
  { code: "OT-SE", name: "Santrokofi", regionCode: "OT", type: "district" },

  // Savannah
  { code: "SV-BN", name: "Bole (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-CE", name: "Central Gonja (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-EB", name: "East Gonja (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-NG", name: "North East Gonja (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-NG1", name: "North Gonja (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-SM", name: "Sawla Tuna Kalba (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-WG", name: "West Gonja (Savannah)", regionCode: "SV", type: "district" },
  { code: "SV-DM", name: "Damongo", regionCode: "SV", type: "district" },

  // Upper East
  { code: "UE-BA", name: "Bawku Central", regionCode: "UE", type: "district" },
  { code: "UE-BS", name: "Bawku West", regionCode: "UE", type: "district" },
  { code: "UE-BI", name: "Binduri", regionCode: "UE", type: "district" },
  { code: "UE-BO", name: "Bolgatanga East", regionCode: "UE", type: "district" },
  { code: "UE-BM", name: "Bolgatanga Municipal", regionCode: "UE", type: "municipal" },
  { code: "UE-BS1", name: "Bongo", regionCode: "UE", type: "district" },
  { code: "UE-BS2", name: "Builsa North", regionCode: "UE", type: "district" },
  { code: "UE-BS3", name: "Builsa South", regionCode: "UE", type: "district" },
  { code: "UE-KA", name: "Kasena Nankana East", regionCode: "UE", type: "district" },
  { code: "UE-KW", name: "Kasena Nankana West", regionCode: "UE", type: "district" },
  { code: "UE-NA", name: "Nabdam", regionCode: "UE", type: "district" },
  { code: "UE-PA", name: "Pusiga", regionCode: "UE", type: "district" },
  { code: "UE-TA", name: "Talensi", regionCode: "UE", type: "district" },
  { code: "UE-TE", name: "Tempane", regionCode: "UE", type: "district" },
  { code: "UE-GA", name: "Garu", regionCode: "UE", type: "district" },
  { code: "UE-TE1", name: "Tema East (Upper East)", regionCode: "UE", type: "district" },

  // Upper West
  { code: "UW-DA", name: "Daffiama Bussie Issa", regionCode: "UW", type: "district" },
  { code: "UW-JI", name: "Jirapa", regionCode: "UW", type: "district" },
  { code: "UW-LA", name: "Lambussie", regionCode: "UW", type: "district" },
  { code: "UW-LW", name: "Lawra", regionCode: "UW", type: "district" },
  { code: "UW-NA", name: "Nadowli", regionCode: "UW", type: "district" },
  { code: "UW-ND", name: "Nandom", regionCode: "UW", type: "district" },
  { code: "UW-SD", name: "Sissala East", regionCode: "UW", type: "district" },
  { code: "UW-SW", name: "Sissala West", regionCode: "UW", type: "district" },
  { code: "UW-SU", name: "Suaman", regionCode: "UW", type: "district" },
  { code: "UW-WA", name: "Wa East", regionCode: "UW", type: "district" },
  { code: "UW-WM", name: "Wa Municipal", regionCode: "UW", type: "municipal" },
  { code: "UW-WS", name: "Wa West", regionCode: "UW", type: "district" },

  // Volta
  { code: "VO-AF", name: "Afadzato South", regionCode: "VO", type: "district" },
  { code: "VO-AG", name: "Agortime Ziope", regionCode: "VO", type: "district" },
  { code: "VO-AK", name: "Akatsi North", regionCode: "VO", type: "district" },
  { code: "VO-AS", name: "Akatsi South", regionCode: "VO", type: "district" },
  { code: "VO-AN", name: "Anloga", regionCode: "VO", type: "district" },
  { code: "VO-AW", name: "Awutu Senya (Volta)", regionCode: "VO", type: "district" },
  { code: "VO-BO", name: "Biakoye (Volta)", regionCode: "VO", type: "district" },
  { code: "VO-CE", name: "Central Tongu", regionCode: "VO", type: "district" },
  { code: "VO-HO", name: "Ho Municipal", regionCode: "VO", type: "municipal" },
  { code: "VO-HW", name: "Ho West", regionCode: "VO", type: "district" },
  { code: "VO-KE", name: "Keta", regionCode: "VO", type: "district" },
  { code: "VO-KM", name: "Ketu North", regionCode: "VO", type: "district" },
  { code: "VO-KS", name: "Ketu South", regionCode: "VO", type: "district" },
  { code: "VO-KP", name: "Kpando", regionCode: "VO", type: "district" },
  { code: "VO-KR", name: "Krachi East (Volta)", regionCode: "VO", type: "district" },
  { code: "VO-NK", name: "North Dayi", regionCode: "VO", type: "district" },
  { code: "VO-NT", name: "North Tongu", regionCode: "VO", type: "district" },
  { code: "VO-SD", name: "South Dayi", regionCode: "VO", type: "district" },
  { code: "VO-ST", name: "South Tongu", regionCode: "VO", type: "district" },
  { code: "VO-AD", name: "Adaklu", regionCode: "VO", type: "district" },

  // Western
  { code: "WE-AB", name: "Ahanta West", regionCode: "WE", type: "district" },
  { code: "WE-AM", name: "Amenfi Central", regionCode: "WE", type: "district" },
  { code: "WE-AE", name: "Amenfi East", regionCode: "WE", type: "district" },
  { code: "WE-AW", name: "Amenfi West", regionCode: "WE", type: "district" },
  { code: "WE-AN", name: "Anhwiaso", regionCode: "WE", type: "district" },
  { code: "WE-BA", name: "Bia East", regionCode: "WE", type: "district" },
  { code: "WE-BW", name: "Bia West", regionCode: "WE", type: "district" },
  { code: "WE-BI", name: "Bibiani", regionCode: "WE", type: "district" },
  { code: "WE-BO", name: "Bodi", regionCode: "WE", type: "district" },
  { code: "WE-JU", name: "Juaboso", regionCode: "WE", type: "district" },
  { code: "WE-ND", name: "Ndebemetia", regionCode: "WE", type: "district" },
  { code: "WE-NM", name: "Mpohor", regionCode: "WE", type: "district" },
  { code: "WE-NW", name: "Nzema East Municipal", regionCode: "WE", type: "municipal" },
  { code: "WE-PR", name: "Prestea Huni Valley", regionCode: "WE", type: "district" },
  { code: "WE-SE", name: "Sekondi Takoradi Metropolitan", regionCode: "WE", type: "metropolitan" },
  { code: "WE-SK", name: "Sekyere (Western)", regionCode: "WE", type: "district" },
  { code: "WE-TA", name: "Tarkwa Nsuaem", regionCode: "WE", type: "district" },
  { code: "WE-WW", name: "Wassa Amenfi East", regionCode: "WE", type: "district" },
  { code: "WE-WR", name: "Wassa Amenfi West", regionCode: "WE", type: "district" },
  { code: "WE-EL", name: "Ellembelle", regionCode: "WE", type: "district" },
  { code: "WE-JI", name: "Jomoro", regionCode: "WE", type: "district" },

  // Western North
  { code: "WN-BB", name: "Bibiani Anhwiaso Bekwai", regionCode: "WN", type: "district" },
  { code: "WN-BI", name: "Bia East (Western North)", regionCode: "WN", type: "district" },
  { code: "WN-BW", name: "Bia West (Western North)", regionCode: "WN", type: "district" },
  { code: "WN-BO", name: "Bodi (Western North)", regionCode: "WN", type: "district" },
  { code: "WN-JU", name: "Juaboso (Western North)", regionCode: "WN", type: "district" },
  { code: "WN-AS", name: "Akrodie", regionCode: "WN", type: "district" },
  { code: "WN-SE", name: "Sehfwi Wiawso", regionCode: "WN", type: "district" },
  { code: "WN-SA", name: "Suaman (Western North)", regionCode: "WN", type: "district" },
  { code: "WN-WA", name: "Wa (Western North)", regionCode: "WN", type: "district" },
  { code: "WN-WI", name: "Wiawso", regionCode: "WN", type: "district" },
  { code: "WN-AO", name: "Aowin", regionCode: "WN", type: "district" },
];

// Helper functions
export function getDistrictsByRegion(regionCode: string): GhanaDistrict[] {
  return GHANA_DISTRICTS.filter((d) => d.regionCode === regionCode);
}

export function getRegionByCode(code: string): GhanaRegion | undefined {
  return GHANA_REGIONS.find((r) => r.code === code);
}

export function getRegionByName(name: string): GhanaRegion | undefined {
  return GHANA_REGIONS.find((r) => r.name.toLowerCase() === name.toLowerCase());
}

// Relationship types — shared between Emergency Contact and Next of Kin
export const RELATIONSHIP_TYPES: string[] = [
  "Parent", "Father", "Mother", "Spouse", "Husband", "Wife",
  "Son", "Daughter", "Brother", "Sister", "Guardian",
  "Grandparent", "Grandchild", "Uncle", "Aunt", "Cousin",
  "Friend", "Caregiver", "Partner", "Employer", "Colleague",
  "Other",
];
