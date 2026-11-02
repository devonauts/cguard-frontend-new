/**
 * Step-by-step guides for the ONE record a brand's client-portal domain needs
 * (a CNAME to our edge), at the most common DNS providers.
 *
 * Ported from the partner panel (`reseller-panel/src/i18n/catalogo/guiasDns.ts`)
 * to the CRM's eight languages, trimmed to the providers most companies use;
 * «Other provider» covers the rest. Provider screen labels stay in English
 * (that is how the panels show them).
 *
 * Placeholders: {host} = what goes in the name field (relative), {destino} =
 * our target, {dominio} = the registered domain.
 */
export interface GuiaDeProveedor {
  id: "cloudflare" | "godaddy" | "namecheap" | "otro";
  nombre: string;
  pasos: string[];
  /** Traps specific to this provider. */
  ojo?: string[];
}

type Idioma = "es" | "en" | "pt" | "fr" | "de" | "it" | "nl" | "pl";

interface Textos {
  otro: string;
  cf: string[];
  cfOjo: string;
  gd: string[];
  gdOjo: string;
  nc: string[];
  ncOjo: string;
  ot: string[];
  otOjo: string;
}

const T: Record<Idioma, Textos> = {
  es: {
    otro: "Otro proveedor",
    cf: [
      "Entra a dash.cloudflare.com y elige {dominio}.",
      "Abre «DNS» → «Records» y pulsa «Add record».",
      "En «Type» elige «CNAME».",
      "En «Name» escribe exactamente: {host}",
      "En «Target» escribe exactamente: {destino}",
      "Pon «Proxy status» en gris («DNS only») y pulsa «Save».",
    ],
    cfOjo: "La nube tiene que quedar GRIS («DNS only»). En naranja, el certificado HTTPS no se emite y la verificación no pasa.",
    gd: [
      "Entra a godaddy.com y abre «My Products».",
      "Junto a {dominio} pulsa «DNS».",
      "Pulsa «Add New Record» y elige «CNAME».",
      "En «Name» escribe exactamente: {host}",
      "En «Value» escribe exactamente: {destino}",
      "Deja el «TTL» como está y pulsa «Save».",
    ],
    gdOjo: "En «Name» no escribas el dominio completo: GoDaddy le añade «.{dominio}».",
    nc: [
      "Entra a namecheap.com, abre «Domain List» y pulsa «Manage» junto a {dominio}.",
      "Abre la pestaña «Advanced DNS».",
      "Pulsa «Add New Record» y elige «CNAME Record».",
      "En «Host» escribe exactamente: {host}",
      "En «Value» escribe exactamente: {destino}",
      "Deja «TTL» en «Automatic» y guarda.",
    ],
    ncOjo: "Si ya hay otro registro con Host {host}, bórralo: no pueden convivir.",
    ot: [
      "Entra al panel donde administras el DNS de {dominio} («DNS», «Zona DNS» o «Registros DNS»).",
      "Crea un registro nuevo de tipo «CNAME».",
      "En el campo del nombre («Host», «Name» o «Alias») escribe: {host}",
      "En el campo del destino («Value», «Target» o «Points to») escribe: {destino}",
      "Guarda. Si el TTL es obligatorio, pon 3600 o «Automático».",
    ],
    otOjo: "Si el panel muestra el dominio al lado del campo del nombre, escribe solo {host}.",
  },
  en: {
    otro: "Other provider",
    cf: [
      "Go to dash.cloudflare.com and pick {dominio}.",
      "Open “DNS” → “Records” and click “Add record”.",
      "In “Type” choose “CNAME”.",
      "In “Name” type exactly: {host}",
      "In “Target” type exactly: {destino}",
      "Set “Proxy status” to grey (“DNS only”) and click “Save”.",
    ],
    cfOjo: "The cloud must be GREY (“DNS only”). With orange, the HTTPS certificate is not issued and verification fails.",
    gd: [
      "Go to godaddy.com and open “My Products”.",
      "Next to {dominio} click “DNS”.",
      "Click “Add New Record” and choose “CNAME”.",
      "In “Name” type exactly: {host}",
      "In “Value” type exactly: {destino}",
      "Keep the “TTL” and click “Save”.",
    ],
    gdOjo: "Do not type the full domain in “Name”: GoDaddy appends “.{dominio}”.",
    nc: [
      "Go to namecheap.com, open “Domain List” and click “Manage” next to {dominio}.",
      "Open the “Advanced DNS” tab.",
      "Click “Add New Record” and choose “CNAME Record”.",
      "In “Host” type exactly: {host}",
      "In “Value” type exactly: {destino}",
      "Leave “TTL” on “Automatic” and save.",
    ],
    ncOjo: "If another record with Host {host} exists, delete it: they cannot coexist.",
    ot: [
      "Open the panel where you manage the DNS of {dominio} (“DNS”, “DNS zone” or “DNS records”).",
      "Create a new record of type “CNAME”.",
      "In the name field (“Host”, “Name” or “Alias”) type: {host}",
      "In the target field (“Value”, “Target” or “Points to”) type: {destino}",
      "Save. If TTL is required, use 3600 or “Automatic”.",
    ],
    otOjo: "If the panel shows the domain next to the name field, type only {host}.",
  },
  pt: {
    otro: "Outro provedor",
    cf: [
      "Acesse dash.cloudflare.com e escolha {dominio}.",
      "Abra “DNS” → “Records” e clique em “Add record”.",
      "Em “Type” escolha “CNAME”.",
      "Em “Name” digite exatamente: {host}",
      "Em “Target” digite exatamente: {destino}",
      "Deixe “Proxy status” em cinza (“DNS only”) e clique em “Save”.",
    ],
    cfOjo: "A nuvem precisa ficar CINZA (“DNS only”). Em laranja, o certificado HTTPS não é emitido e a verificação falha.",
    gd: [
      "Acesse godaddy.com e abra “My Products”.",
      "Ao lado de {dominio} clique em “DNS”.",
      "Clique em “Add New Record” e escolha “CNAME”.",
      "Em “Name” digite exatamente: {host}",
      "Em “Value” digite exatamente: {destino}",
      "Mantenha o “TTL” e clique em “Save”.",
    ],
    gdOjo: "Não digite o domínio completo em “Name”: a GoDaddy acrescenta “.{dominio}”.",
    nc: [
      "Acesse namecheap.com, abra “Domain List” e clique em “Manage” ao lado de {dominio}.",
      "Abra a aba “Advanced DNS”.",
      "Clique em “Add New Record” e escolha “CNAME Record”.",
      "Em “Host” digite exatamente: {host}",
      "Em “Value” digite exatamente: {destino}",
      "Deixe “TTL” em “Automatic” e salve.",
    ],
    ncOjo: "Se já existir outro registro com Host {host}, apague-o: eles não podem coexistir.",
    ot: [
      "Abra o painel onde você administra o DNS de {dominio} (“DNS”, “Zona DNS” ou “Registros DNS”).",
      "Crie um registro novo do tipo “CNAME”.",
      "No campo do nome (“Host”, “Name” ou “Alias”) digite: {host}",
      "No campo do destino (“Value”, “Target” ou “Points to”) digite: {destino}",
      "Salve. Se o TTL for obrigatório, use 3600 ou “Automático”.",
    ],
    otOjo: "Se o painel mostra o domínio ao lado do campo do nome, digite só {host}.",
  },
  fr: {
    otro: "Autre fournisseur",
    cf: [
      "Allez sur dash.cloudflare.com et choisissez {dominio}.",
      "Ouvrez « DNS » → « Records » et cliquez sur « Add record ».",
      "Dans « Type », choisissez « CNAME ».",
      "Dans « Name », saisissez exactement : {host}",
      "Dans « Target », saisissez exactement : {destino}",
      "Mettez « Proxy status » en gris (« DNS only ») et cliquez sur « Save ».",
    ],
    cfOjo: "Le nuage doit être GRIS (« DNS only »). En orange, le certificat HTTPS n’est pas émis et la vérification échoue.",
    gd: [
      "Allez sur godaddy.com et ouvrez « My Products ».",
      "À côté de {dominio}, cliquez sur « DNS ».",
      "Cliquez sur « Add New Record » et choisissez « CNAME ».",
      "Dans « Name », saisissez exactement : {host}",
      "Dans « Value », saisissez exactement : {destino}",
      "Gardez le « TTL » et cliquez sur « Save ».",
    ],
    gdOjo: "Ne saisissez pas le domaine complet dans « Name » : GoDaddy ajoute « .{dominio} ».",
    nc: [
      "Allez sur namecheap.com, ouvrez « Domain List » et cliquez sur « Manage » à côté de {dominio}.",
      "Ouvrez l’onglet « Advanced DNS ».",
      "Cliquez sur « Add New Record » et choisissez « CNAME Record ».",
      "Dans « Host », saisissez exactement : {host}",
      "Dans « Value », saisissez exactement : {destino}",
      "Laissez « TTL » sur « Automatic » et enregistrez.",
    ],
    ncOjo: "Si un autre enregistrement avec Host {host} existe, supprimez-le : ils ne peuvent pas coexister.",
    ot: [
      "Ouvrez le panneau où vous gérez le DNS de {dominio} (« DNS », « Zone DNS » ou « Enregistrements DNS »).",
      "Créez un nouvel enregistrement de type « CNAME ».",
      "Dans le champ du nom (« Host », « Name » ou « Alias »), saisissez : {host}",
      "Dans le champ de la cible (« Value », « Target » ou « Points to »), saisissez : {destino}",
      "Enregistrez. Si le TTL est obligatoire, mettez 3600 ou « Automatique ».",
    ],
    otOjo: "Si le panneau affiche le domaine à côté du champ du nom, saisissez seulement {host}.",
  },
  de: {
    otro: "Anderer Anbieter",
    cf: [
      "Öffnen Sie dash.cloudflare.com und wählen Sie {dominio}.",
      "Öffnen Sie „DNS“ → „Records“ und klicken Sie auf „Add record“.",
      "Wählen Sie bei „Type“ „CNAME“.",
      "Geben Sie bei „Name“ genau ein: {host}",
      "Geben Sie bei „Target“ genau ein: {destino}",
      "Stellen Sie „Proxy status“ auf grau („DNS only“) und klicken Sie auf „Save“.",
    ],
    cfOjo: "Die Wolke muss GRAU sein („DNS only“). In Orange wird kein HTTPS-Zertifikat ausgestellt und die Prüfung schlägt fehl.",
    gd: [
      "Öffnen Sie godaddy.com und gehen Sie zu „My Products“.",
      "Klicken Sie neben {dominio} auf „DNS“.",
      "Klicken Sie auf „Add New Record“ und wählen Sie „CNAME“.",
      "Geben Sie bei „Name“ genau ein: {host}",
      "Geben Sie bei „Value“ genau ein: {destino}",
      "Lassen Sie die „TTL“ und klicken Sie auf „Save“.",
    ],
    gdOjo: "Geben Sie bei „Name“ nicht die ganze Domain ein: GoDaddy hängt „.{dominio}“ selbst an.",
    nc: [
      "Öffnen Sie namecheap.com, dann „Domain List“ und klicken Sie neben {dominio} auf „Manage“.",
      "Öffnen Sie den Reiter „Advanced DNS“.",
      "Klicken Sie auf „Add New Record“ und wählen Sie „CNAME Record“.",
      "Geben Sie bei „Host“ genau ein: {host}",
      "Geben Sie bei „Value“ genau ein: {destino}",
      "Lassen Sie „TTL“ auf „Automatic“ und speichern Sie.",
    ],
    ncOjo: "Gibt es schon einen anderen Eintrag mit Host {host}, löschen Sie ihn: beide können nicht nebeneinander bestehen.",
    ot: [
      "Öffnen Sie das Panel, in dem Sie das DNS von {dominio} verwalten („DNS“, „DNS-Zone“ oder „DNS-Einträge“).",
      "Legen Sie einen neuen Eintrag vom Typ „CNAME“ an.",
      "Geben Sie im Namensfeld („Host“, „Name“ oder „Alias“) ein: {host}",
      "Geben Sie im Zielfeld („Value“, „Target“ oder „Points to“) ein: {destino}",
      "Speichern Sie. Ist eine TTL Pflicht, nehmen Sie 3600 oder „Automatisch“.",
    ],
    otOjo: "Zeigt das Panel die Domain neben dem Namensfeld, geben Sie nur {host} ein.",
  },
  it: {
    otro: "Altro provider",
    cf: [
      "Vai su dash.cloudflare.com e scegli {dominio}.",
      "Apri «DNS» → «Records» e clicca «Add record».",
      "In «Type» scegli «CNAME».",
      "In «Name» scrivi esattamente: {host}",
      "In «Target» scrivi esattamente: {destino}",
      "Metti «Proxy status» in grigio («DNS only») e clicca «Save».",
    ],
    cfOjo: "La nuvola deve restare GRIGIA («DNS only»). In arancione il certificato HTTPS non viene emesso e la verifica non passa.",
    gd: [
      "Vai su godaddy.com e apri «My Products».",
      "Accanto a {dominio} clicca «DNS».",
      "Clicca «Add New Record» e scegli «CNAME».",
      "In «Name» scrivi esattamente: {host}",
      "In «Value» scrivi esattamente: {destino}",
      "Lascia il «TTL» com’è e clicca «Save».",
    ],
    gdOjo: "In «Name» non scrivere il dominio completo: GoDaddy aggiunge «.{dominio}».",
    nc: [
      "Vai su namecheap.com, apri «Domain List» e clicca «Manage» accanto a {dominio}.",
      "Apri la scheda «Advanced DNS».",
      "Clicca «Add New Record» e scegli «CNAME Record».",
      "In «Host» scrivi esattamente: {host}",
      "In «Value» scrivi esattamente: {destino}",
      "Lascia «TTL» su «Automatic» e salva.",
    ],
    ncOjo: "Se esiste già un altro record con Host {host}, cancellalo: non possono convivere.",
    ot: [
      "Apri il pannello dove gestisci il DNS di {dominio} («DNS», «Zona DNS» o «Record DNS»).",
      "Crea un nuovo record di tipo «CNAME».",
      "Nel campo del nome («Host», «Name» o «Alias») scrivi: {host}",
      "Nel campo della destinazione («Value», «Target» o «Points to») scrivi: {destino}",
      "Salva. Se il TTL è obbligatorio, metti 3600 o «Automatico».",
    ],
    otOjo: "Se il pannello mostra il dominio accanto al campo del nome, scrivi solo {host}.",
  },
  nl: {
    otro: "Andere provider",
    cf: [
      "Ga naar dash.cloudflare.com en kies {dominio}.",
      "Open “DNS” → “Records” en klik op “Add record”.",
      "Kies bij “Type” “CNAME”.",
      "Typ bij “Name” precies: {host}",
      "Typ bij “Target” precies: {destino}",
      "Zet “Proxy status” op grijs (“DNS only”) en klik op “Save”.",
    ],
    cfOjo: "De wolk moet GRIJS zijn (“DNS only”). In oranje wordt het HTTPS-certificaat niet uitgegeven en mislukt de controle.",
    gd: [
      "Ga naar godaddy.com en open “My Products”.",
      "Klik naast {dominio} op “DNS”.",
      "Klik op “Add New Record” en kies “CNAME”.",
      "Typ bij “Name” precies: {host}",
      "Typ bij “Value” precies: {destino}",
      "Laat de “TTL” staan en klik op “Save”.",
    ],
    gdOjo: "Typ bij “Name” niet het volledige domein: GoDaddy voegt “.{dominio}” zelf toe.",
    nc: [
      "Ga naar namecheap.com, open “Domain List” en klik naast {dominio} op “Manage”.",
      "Open het tabblad “Advanced DNS”.",
      "Klik op “Add New Record” en kies “CNAME Record”.",
      "Typ bij “Host” precies: {host}",
      "Typ bij “Value” precies: {destino}",
      "Laat “TTL” op “Automatic” en sla op.",
    ],
    ncOjo: "Bestaat er al een ander record met Host {host}, verwijder het dan: ze kunnen niet naast elkaar bestaan.",
    ot: [
      "Open het paneel waar je de DNS van {dominio} beheert (“DNS”, “DNS-zone” of “DNS-records”).",
      "Maak een nieuw record van het type “CNAME”.",
      "Typ in het naamveld (“Host”, “Name” of “Alias”): {host}",
      "Typ in het doelveld (“Value”, “Target” of “Points to”): {destino}",
      "Sla op. Is een TTL verplicht, gebruik dan 3600 of “Automatisch”.",
    ],
    otOjo: "Toont het paneel het domein naast het naamveld, typ dan alleen {host}.",
  },
  pl: {
    otro: "Inny dostawca",
    cf: [
      "Wejdź na dash.cloudflare.com i wybierz {dominio}.",
      "Otwórz „DNS” → „Records” i kliknij „Add record”.",
      "W „Type” wybierz „CNAME”.",
      "W „Name” wpisz dokładnie: {host}",
      "W „Target” wpisz dokładnie: {destino}",
      "Ustaw „Proxy status” na szary („DNS only”) i kliknij „Save”.",
    ],
    cfOjo: "Chmurka musi być SZARA („DNS only”). Na pomarańczowo certyfikat HTTPS nie zostanie wydany i weryfikacja się nie powiedzie.",
    gd: [
      "Wejdź na godaddy.com i otwórz „My Products”.",
      "Obok {dominio} kliknij „DNS”.",
      "Kliknij „Add New Record” i wybierz „CNAME”.",
      "W „Name” wpisz dokładnie: {host}",
      "W „Value” wpisz dokładnie: {destino}",
      "Zostaw „TTL” i kliknij „Save”.",
    ],
    gdOjo: "W „Name” nie wpisuj całej domeny: GoDaddy sam dopisuje „.{dominio}”.",
    nc: [
      "Wejdź na namecheap.com, otwórz „Domain List” i kliknij „Manage” obok {dominio}.",
      "Otwórz kartę „Advanced DNS”.",
      "Kliknij „Add New Record” i wybierz „CNAME Record”.",
      "W „Host” wpisz dokładnie: {host}",
      "W „Value” wpisz dokładnie: {destino}",
      "Zostaw „TTL” na „Automatic” i zapisz.",
    ],
    ncOjo: "Jeśli istnieje już inny rekord z Host {host}, usuń go: nie mogą istnieć razem.",
    ot: [
      "Otwórz panel, w którym zarządzasz DNS domeny {dominio} („DNS”, „Strefa DNS” lub „Rekordy DNS”).",
      "Utwórz nowy rekord typu „CNAME”.",
      "W polu nazwy („Host”, „Name” lub „Alias”) wpisz: {host}",
      "W polu celu („Value”, „Target” lub „Points to”) wpisz: {destino}",
      "Zapisz. Jeśli TTL jest wymagany, wpisz 3600 lub „Automatycznie”.",
    ],
    otOjo: "Jeśli panel pokazuje domenę obok pola nazwy, wpisz tylko {host}.",
  },
};

/** The guides in the CRM language (Spanish when the language is unknown). */
export function guiasDns(idioma: string): GuiaDeProveedor[] {
  const k = String(idioma || "es").slice(0, 2).toLowerCase() as Idioma;
  const x = T[k] || T.es;

  return [
    { id: "cloudflare", nombre: "Cloudflare", pasos: x.cf, ojo: [x.cfOjo] },
    { id: "godaddy", nombre: "GoDaddy", pasos: x.gd, ojo: [x.gdOjo] },
    { id: "namecheap", nombre: "Namecheap", pasos: x.nc, ojo: [x.ncOjo] },
    { id: "otro", nombre: x.otro, pasos: x.ot, ojo: [x.otOjo] },
  ];
}

/** Every language has the same providers and the same number of steps (tested). */
export const IDIOMAS_DE_GUIAS = Object.keys(T);

/** Fills `{dominio}`; `{host}` and `{destino}` stay for the renderer to show as code. */
export function rellenarDominio(texto: string, dominio: string): string {
  return texto.split("{dominio}").join(dominio);
}
