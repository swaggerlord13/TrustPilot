/**
 * Comprehensive list of major African cities organized by country.
 * Used to populate the city dropdown filter even when no companies
 * are listed in those cities yet.
 */

const AFRICAN_CITIES = {
  "Algeria": [
    "Algiers", "Oran", "Constantine", "Annaba", "Blida",
    "Batna", "Sétif", "Djelfa", "Biskra", "Tlemcen"
  ],
  "Angola": [
    "Luanda", "Huambo", "Lobito", "Benguela", "Cabinda",
    "Lubango", "Malanje", "Namibe", "Soyo", "Uíge"
  ],
  "Benin": [
    "Cotonou", "Porto-Novo", "Parakou", "Djougou", "Bohicon",
    "Abomey-Calavi", "Natitingou", "Lokossa", "Ouidah", "Kandi"
  ],
  "Botswana": [
    "Gaborone", "Francistown", "Maun", "Serowe", "Molepolole",
    "Selebi-Phikwe", "Kanye", "Kasane", "Lobatse", "Palapye"
  ],
  "Burkina Faso": [
    "Ouagadougou", "Bobo-Dioulasso", "Koudougou", "Ouahigouya",
    "Banfora", "Kaya", "Tenkodogo", "Dédougou", "Fada N'Gourma", "Ziniaré"
  ],
  "Burundi": [
    "Bujumbura", "Gitega", "Muyinga", "Ngozi", "Rumonge",
    "Ruyigi", "Kayanza", "Makamba", "Cibitoke", "Bubanza"
  ],
  "Cameroon": [
    "Douala", "Yaoundé", "Bamenda", "Bafoussam", "Garoua",
    "Maroua", "Ngaoundéré", "Kumba", "Buea", "Limbe",
    "Bertoua", "Kribi", "Ebolowa", "Nkongsamba"
  ],
  "Cape Verde": [
    "Praia", "Mindelo", "Santa Maria", "Assomada", "Espargos",
    "São Filipe", "Tarrafal", "Porto Novo"
  ],
  "Central African Republic": [
    "Bangui", "Bimbo", "Berbérati", "Carnot", "Bambari",
    "Bouar", "Bossangoa", "Bria", "Bangassou", "Nola"
  ],
  "Chad": [
    "N'Djamena", "Moundou", "Sarh", "Abéché", "Kélo",
    "Koumra", "Pala", "Am Timan", "Bongor", "Mongo"
  ],
  "Comoros": [
    "Moroni", "Mutsamudu", "Fomboni", "Domoni", "Mitsamiouli"
  ],
  "Congo (Brazzaville)": [
    "Brazzaville", "Pointe-Noire", "Dolisie", "Nkayi", "Owando",
    "Ouésso", "Madingou", "Impfondo", "Sibiti", "Mossendjo"
  ],
  "Congo (DRC)": [
    "Kinshasa", "Lubumbashi", "Mbuji-Mayi", "Kisangani", "Kananga",
    "Bukavu", "Goma", "Likasi", "Kolwezi", "Tshikapa",
    "Matadi", "Kikwit", "Boma", "Uvira", "Butembo"
  ],
  "Côte d'Ivoire": [
    "Abidjan", "Bouaké", "Yamoussoukro", "Daloa", "Korhogo",
    "San-Pédro", "Man", "Divo", "Gagnoa", "Abengourou",
    "Anyama", "Grand-Bassam", "Séguéla", "Bondoukou"
  ],
  "Djibouti": [
    "Djibouti City", "Ali Sabieh", "Tadjoura", "Obock", "Dikhil", "Arta"
  ],
  "Egypt": [
    "Cairo", "Alexandria", "Giza", "Shubra El-Kheima", "Port Said",
    "Suez", "Luxor", "Aswan", "Mansoura", "Tanta",
    "Ismailia", "Hurghada", "Sharm El-Sheikh", "Faiyum", "Zagazig"
  ],
  "Equatorial Guinea": [
    "Malabo", "Bata", "Ebebiyín", "Aconibe", "Añisoc",
    "Luba", "Evinayong", "Mongomo"
  ],
  "Eritrea": [
    "Asmara", "Keren", "Massawa", "Assab", "Mendefera",
    "Adi Keyh", "Barentu", "Dekemhare", "Adi Quala", "Senafe"
  ],
  "Eswatini": [
    "Mbabane", "Manzini", "Lobamba", "Siteki", "Piggs Peak",
    "Nhlangano", "Big Bend", "Simunye", "Malkerns", "Matsapha"
  ],
  "Ethiopia": [
    "Addis Ababa", "Dire Dawa", "Mekelle", "Gondar", "Hawassa",
    "Bahir Dar", "Adama", "Jimma", "Dessie", "Harar",
    "Jijiga", "Debre Markos", "Bishoftu", "Arba Minch", "Shashamane"
  ],
  "Gabon": [
    "Libreville", "Port-Gentil", "Franceville", "Oyem", "Moanda",
    "Mouila", "Lambaréné", "Tchibanga", "Koulamoutou", "Makokou"
  ],
  "Gambia": [
    "Banjul", "Serekunda", "Brikama", "Bakau", "Farafenni",
    "Lamin", "Sukuta", "Brusubi", "Gunjur", "Soma"
  ],
  "Ghana": [
    "Accra", "Kumasi", "Tamale", "Takoradi", "Sekondi",
    "Cape Coast", "Sunyani", "Obuasi", "Tema", "Techiman",
    "Ho", "Koforidua", "Wa", "Bolgatanga", "Nkawkaw",
    "Winneba", "Tarkwa", "Elmina"
  ],
  "Guinea": [
    "Conakry", "Nzérékoré", "Kankan", "Kindia", "Labé",
    "Siguiri", "Mamou", "Boké", "Guéckédou", "Kissidougou"
  ],
  "Guinea-Bissau": [
    "Bissau", "Gabú", "Bafatá", "Bissorã", "Bolama",
    "Cacheu", "Catió", "Mansôa", "Farim", "Quinhámel"
  ],
  "Kenya": [
    "Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret",
    "Thika", "Malindi", "Kitale", "Garissa", "Nyeri",
    "Machakos", "Meru", "Nanyuki", "Lamu", "Naivasha",
    "Embu", "Kericho", "Ruiru", "Isiolo"
  ],
  "Lesotho": [
    "Maseru", "Teyateyaneng", "Mafeteng", "Hlotse", "Mohale's Hoek",
    "Quthing", "Qacha's Nek", "Butha-Buthe", "Mokhotlong", "Thaba-Tseka"
  ],
  "Liberia": [
    "Monrovia", "Gbarnga", "Buchanan", "Kakata", "Harper",
    "Voinjama", "Zwedru", "Sanniquellie", "Tubmanburg", "Greenville"
  ],
  "Libya": [
    "Tripoli", "Benghazi", "Misrata", "Tarhuna", "Al Khums",
    "Zliten", "Zawiya", "Ajdabiya", "Sabha", "Sirte",
    "Derna", "Tobruk", "Gharyan"
  ],
  "Madagascar": [
    "Antananarivo", "Toamasina", "Antsirabe", "Fianarantsoa", "Mahajanga",
    "Toliara", "Antsiranana", "Ambovombe", "Mananjary", "Ambatondrazaka"
  ],
  "Malawi": [
    "Lilongwe", "Blantyre", "Mzuzu", "Zomba", "Kasungu",
    "Mangochi", "Karonga", "Salima", "Nkhotakota", "Dedza"
  ],
  "Mali": [
    "Bamako", "Sikasso", "Mopti", "Ségou", "Koutiala",
    "Kayes", "Gao", "Kati", "Timbuktu", "San"
  ],
  "Mauritania": [
    "Nouakchott", "Nouadhibou", "Kiffa", "Kaédi", "Rosso",
    "Zouérat", "Atar", "Néma", "Aleg", "Tidjikja"
  ],
  "Mauritius": [
    "Port Louis", "Beau Bassin-Rose Hill", "Vacoas-Phoenix", "Curepipe",
    "Quatre Bornes", "Triolet", "Goodlands", "Centre de Flacq",
    "Mahébourg", "Saint Pierre"
  ],
  "Morocco": [
    "Casablanca", "Rabat", "Fes", "Marrakech", "Tangier",
    "Agadir", "Meknes", "Oujda", "Kenitra", "Tétouan",
    "Safi", "Mohammedia", "El Jadida", "Nador", "Béni Mellal",
    "Essaouira", "Chefchaouen"
  ],
  "Mozambique": [
    "Maputo", "Matola", "Beira", "Nampula", "Chimoio",
    "Nacala", "Quelimane", "Tete", "Xai-Xai", "Pemba",
    "Lichinga", "Inhambane", "Maxixe", "Gurué"
  ],
  "Namibia": [
    "Windhoek", "Walvis Bay", "Swakopmund", "Oshakati", "Rundu",
    "Katima Mulilo", "Otjiwarongo", "Keetmanshoop", "Ondangwa", "Rehoboth",
    "Gobabis", "Tsumeb", "Lüderitz", "Mariental"
  ],
  "Niger": [
    "Niamey", "Zinder", "Maradi", "Agadez", "Tahoua",
    "Dosso", "Diffa", "Arlit", "Birni-N'Konni", "Tessaoua"
  ],
  "Nigeria": [
    "Lagos", "Abuja", "Kano", "Ibadan", "Port Harcourt",
    "Benin City", "Kaduna", "Enugu", "Calabar", "Warri",
    "Aba", "Jos", "Ilorin", "Abeokuta", "Onitsha",
    "Uyo", "Owerri", "Sokoto", "Maiduguri", "Asaba",
    "Akure", "Ado-Ekiti", "Osogbo", "Zaria", "Bauchi",
    "Yola", "Lokoja", "Lafia", "Makurdi", "Abakaliki",
    "Ogbomoso", "Ile-Ife", "Lekki", "Victoria Island", "Ikeja"
  ],
  "Rwanda": [
    "Kigali", "Butare", "Gisenyi", "Ruhengeri", "Gitarama",
    "Byumba", "Cyangugu", "Kibungo", "Kibuye", "Nyanza"
  ],
  "São Tomé and Príncipe": [
    "São Tomé", "Santo Amaro", "Neves", "Santana", "Trindade",
    "Guadalupe", "Santo António"
  ],
  "Senegal": [
    "Dakar", "Touba", "Thiès", "Saint-Louis", "Kaolack",
    "Ziguinchor", "Rufisque", "Mbour", "Diourbel", "Tambacounda",
    "Louga", "Richard-Toll", "Kolda", "Fatick", "Kédougou"
  ],
  "Seychelles": [
    "Victoria", "Anse Boileau", "Beau Vallon", "Anse Royale", "Cascade"
  ],
  "Sierra Leone": [
    "Freetown", "Bo", "Kenema", "Makeni", "Koidu",
    "Lunsar", "Port Loko", "Bonthe", "Waterloo", "Kabala"
  ],
  "Somalia": [
    "Mogadishu", "Hargeisa", "Kismayo", "Marka", "Berbera",
    "Baidoa", "Burao", "Bosaso", "Galkayo", "Garowe",
    "Beledweyne", "Jamaame", "Borama"
  ],
  "South Africa": [
    "Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth",
    "Bloemfontein", "East London", "Polokwane", "Nelspruit", "Kimberley",
    "Pietermaritzburg", "Soweto", "Sandton", "Stellenbosch", "George",
    "Rustenburg", "Centurion", "Midrand", "Umhlanga", "Randburg",
    "Richards Bay", "Paarl", "Knysna", "Mbombela"
  ],
  "South Sudan": [
    "Juba", "Malakal", "Wau", "Bor", "Yambio",
    "Rumbek", "Aweil", "Bentiu", "Torit", "Kapoeta"
  ],
  "Sudan": [
    "Khartoum", "Omdurman", "Port Sudan", "Kassala", "El-Obeid",
    "Nyala", "Wad Madani", "El Fasher", "Gedaref", "Atbara",
    "Dongola", "Kosti"
  ],
  "Tanzania": [
    "Dar es Salaam", "Dodoma", "Mwanza", "Arusha", "Zanzibar City",
    "Mbeya", "Morogoro", "Tanga", "Iringa", "Tabora",
    "Kigoma", "Songea", "Musoma", "Bukoba", "Moshi",
    "Bagamoyo", "Lindi", "Mtwara"
  ],
  "Togo": [
    "Lomé", "Sokodé", "Kara", "Kpalimé", "Atakpamé",
    "Bassar", "Tsévié", "Aného", "Mango", "Dapaong"
  ],
  "Tunisia": [
    "Tunis", "Sfax", "Sousse", "Kairouan", "Bizerte",
    "Gabès", "Ariana", "Gafsa", "Monastir", "Ben Arous",
    "Hammamet", "Djerba", "Nabeul", "Tozeur"
  ],
  "Uganda": [
    "Kampala", "Entebbe", "Gulu", "Lira", "Mbarara",
    "Jinja", "Mbale", "Fort Portal", "Masaka", "Arua",
    "Soroti", "Kabale", "Hoima", "Mukono", "Tororo"
  ],
  "Zambia": [
    "Lusaka", "Kitwe", "Ndola", "Kabwe", "Livingstone",
    "Chipata", "Mufulira", "Luanshya", "Kasama", "Solwezi",
    "Chingola", "Mansa", "Mongu", "Mazabuka"
  ],
  "Zimbabwe": [
    "Harare", "Bulawayo", "Chitungwiza", "Mutare", "Gweru",
    "Masvingo", "Kwekwe", "Kadoma", "Chinhoyi", "Victoria Falls",
    "Bindura", "Zvishavane", "Karoi", "Beitbridge"
  ],
};

module.exports = AFRICAN_CITIES;
