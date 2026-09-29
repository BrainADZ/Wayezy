import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Tenant } from '../../../packages/domain';

const en = {
  'home.greeting': 'Where would you like to go?',
  'home.subtitle': 'Find shops, food, cinema and services in seconds.',
  'search.placeholder': 'Search shops, food, cinema, services…',
  'search.popular': 'Popular right now',
  'search.results': '{count} places match “{query}”',
  'search.none.title': 'We couldn’t find “{query}”',
  'search.none.body': 'Try a different word, or browse by category below.',
  'search.didYouMean': 'Did you mean',
  'search.done': 'Show results',
  'group.food': 'Food & drink',
  'group.shops': 'Shops',
  'group.entertainment': 'Cinema & fun',
  'group.services': 'Services',
  'group.amenities': 'Amenities',
  'categories.title': 'Browse',
  'categories.offers': 'Offers',
  'categories.events': 'Events',
  'amenities.title': 'Quick help',
  'amenity.Parking': 'Parking',
  'amenity.Washroom': 'Washroom',
  'amenity.ATM': 'ATM',
  'amenity.Lift': 'Lift',
  'amenity.Information': 'Information',
  'amenity.Accessibility': 'Accessibility',
  'amenity.nearest': 'Nearest',
  'map.youAreHere': 'You are here',
  'map.floor': 'Floor',
  'map.view3d': '3D',
  'map.view2d': '2D',
  'map.exploded': 'All floors',
  'map.singleFloor': 'One floor',
  'map.recenter': 'Recenter',
  'map.zoomIn': 'Zoom in',
  'map.zoomOut': 'Zoom out',
  'tenant.getDirections': 'Get directions',
  'tenant.viewOnMap': 'View on map',
  'tenant.sendToPhone': 'Send to phone',
  'tenant.knownFor': 'Known for',
  'tenant.hours': 'Opening hours',
  'tenant.today': 'Today',
  'tenant.openNow': 'Open now',
  'tenant.closesAt': 'Closes {time}',
  'tenant.closingSoon': 'Closing soon · {time}',
  'tenant.closed': 'Closed',
  'tenant.opensAt': 'Opens {time}',
  'tenant.temporarilyClosed': 'Temporarily closed',
  'tenant.comingSoon': 'Coming soon',
  'tenant.cuisine': 'Cuisine',
  'tenant.dietary': 'Dietary options',
  'tenant.dineIn': 'Dine-in',
  'tenant.takeaway': 'Takeaway',
  'tenant.delivery': 'Delivery',
  'tenant.menu': 'Menu',
  'tenant.showtimes': 'Today’s showtimes',
  'tenant.bookTickets': 'Book tickets',
  'tenant.services': 'Services',
  'tenant.accessibility': 'Accessibility',
  'tenant.offer': 'Current offer',
  'tenant.gallery': 'Gallery',
  'tenant.closedNotice': 'This store is temporarily closed. You can still view it on the map.',
  'route.to': 'Your route to',
  'route.minutes': '{n} min',
  'route.metres': '{n} m',
  'route.walk': 'walk',
  'route.accessible': 'Accessible route',
  'route.accessibleHint': 'Step-free route using lifts and accessible paths',
  'route.standard': 'Standard route',
  'route.standardHint': 'Fastest route, may use escalators',
  'route.steps': 'Step-by-step',
  'route.replay': 'Replay',
  'route.startOver': 'Start over',
  'route.back': 'Back',
  'route.arrived': 'You’ve arrived',
  'route.unavailable.title': 'No route available right now',
  'route.unavailable.body':
    'A corridor on this route is closed. Please ask the information desk or try the other route option.',
  'route.noAccessible':
    'No step-free route is available at the moment. Staff at the information desk can help.',
  'route.updated': 'Route updated — a corridor has changed.',
  'route.floorChange': 'Floor change',
  'qr.title': 'Continue on your phone',
  'qr.body': 'Scan to open this route — no app needed.',
  'qr.expires': 'Link valid for {n} minutes',
  'qr.offline': 'Phone hand-off needs a connection. Directions on this screen still work.',
  'qr.generating': 'Creating your secure link…',
  'ad.touch': 'Touch anywhere to explore',
  'nav.home': 'Home',
  'nav.offers': 'Offers',
  'nav.events': 'Events',
  'nav.help': 'Help',
  'offers.title': 'Offers & promotions',
  'events.title': 'What’s on',
  'events.upcoming': 'Upcoming',
  'events.now': 'On now',
  'help.title': 'How can we help?',
  'help.info': 'Visit the information desk',
  'help.accessible': 'Step-free routes',
  'help.accessibleBody': 'Turn on accessible routes to use lifts and ramps only.',
  'help.call': 'Call centre management',
  'help.lost': 'Lost & found and wheelchairs',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.viewAll': 'View all',
  'common.directions': 'Directions',
  'common.offline': 'Offline · saved directory',
  'common.updated': 'Directory updated',
  'go.nextStep': 'Next step',
  'go.stepOf': 'Step {n} of {total}',
  'go.allSteps': 'All steps',
  'go.viewProfile': 'View details',
  'go.fromKiosk': 'Guided from {place}',
  'go.noApp': 'No app required · secure link',
  'go.expired.title': 'This route link has expired',
  'go.expired.body':
    'Scan a fresh QR code at any WAY EZY kiosk, or search for your destination here.',
  'go.invalid.title': 'We couldn’t open this link',
  'go.search': 'Search the directory',
  'go.chooseStart': 'Starting point',
  'go.install': 'Add to home screen',
  'a11y.title': 'Accessibility',
  'a11y.largeText': 'Larger text',
  'a11y.contrast': 'High contrast',
  'a11y.stepFree': 'Step-free routes',
  'lang.label': 'Language',
};

type Key = keyof typeof en;

const hi: Partial<Record<Key, string>> = {
  'home.greeting': 'आप कहाँ जाना चाहेंगे?',
  'home.subtitle': 'दुकानें, खाना, सिनेमा और सेवाएँ पल भर में खोजें।',
  'search.placeholder': 'दुकानें, खाना, सिनेमा, सेवाएँ खोजें…',
  'search.popular': 'अभी लोकप्रिय',
  'search.results': '“{query}” के लिए {count} जगहें',
  'search.none.title': '“{query}” नहीं मिला',
  'search.none.body': 'कोई दूसरा शब्द आज़माएँ या नीचे श्रेणी चुनें।',
  'search.didYouMean': 'क्या आपका मतलब',
  'search.done': 'परिणाम दिखाएँ',
  'group.food': 'खाना-पीना',
  'group.shops': 'दुकानें',
  'group.entertainment': 'सिनेमा और मनोरंजन',
  'group.services': 'सेवाएँ',
  'group.amenities': 'सुविधाएँ',
  'categories.title': 'ब्राउज़ करें',
  'categories.offers': 'ऑफ़र',
  'categories.events': 'कार्यक्रम',
  'amenities.title': 'त्वरित सहायता',
  'amenity.Parking': 'पार्किंग',
  'amenity.Washroom': 'शौचालय',
  'amenity.ATM': 'एटीएम',
  'amenity.Lift': 'लिफ़्ट',
  'amenity.Information': 'जानकारी',
  'amenity.Accessibility': 'सुगम्यता',
  'amenity.nearest': 'सबसे नज़दीक',
  'map.youAreHere': 'आप यहाँ हैं',
  'map.exploded': 'सभी मंज़िलें',
  'map.singleFloor': 'एक मंज़िल',
  'map.recenter': 'केंद्र में लाएँ',
  'tenant.getDirections': 'रास्ता देखें',
  'tenant.viewOnMap': 'नक्शे पर देखें',
  'tenant.sendToPhone': 'फ़ोन पर भेजें',
  'tenant.knownFor': 'ख़ासियत',
  'tenant.hours': 'खुलने का समय',
  'tenant.today': 'आज',
  'tenant.openNow': 'अभी खुला है',
  'tenant.closesAt': '{time} बजे बंद',
  'tenant.closed': 'बंद',
  'tenant.opensAt': '{time} बजे खुलेगा',
  'tenant.temporarilyClosed': 'अस्थायी रूप से बंद',
  'tenant.comingSoon': 'जल्द आ रहा है',
  'tenant.cuisine': 'व्यंजन',
  'tenant.dietary': 'आहार विकल्प',
  'tenant.showtimes': 'आज के शो',
  'tenant.offer': 'वर्तमान ऑफ़र',
  'route.to': 'आपका रास्ता',
  'route.minutes': '{n} मिनट',
  'route.metres': '{n} मी',
  'route.accessible': 'सुगम मार्ग',
  'route.accessibleHint': 'लिफ़्ट और सुगम रास्तों वाला बिना सीढ़ी का मार्ग',
  'route.standard': 'सामान्य मार्ग',
  'route.standardHint': 'सबसे तेज़ मार्ग, एस्केलेटर शामिल हो सकते हैं',
  'route.steps': 'क़दम-दर-क़दम',
  'route.replay': 'फिर से दिखाएँ',
  'route.startOver': 'फिर से शुरू करें',
  'route.back': 'वापस',
  'route.arrived': 'आप पहुँच गए',
  'qr.title': 'अपने फ़ोन पर जारी रखें',
  'qr.body': 'यह रास्ता खोलने के लिए स्कैन करें — ऐप की ज़रूरत नहीं।',
  'ad.touch': 'देखने के लिए कहीं भी छुएँ',
  'nav.home': 'होम',
  'nav.offers': 'ऑफ़र',
  'nav.events': 'कार्यक्रम',
  'nav.help': 'मदद',
  'offers.title': 'ऑफ़र और प्रमोशन',
  'events.title': 'क्या चल रहा है',
  'help.title': 'हम कैसे मदद करें?',
  'common.close': 'बंद करें',
  'common.back': 'वापस',
  'common.directions': 'रास्ता',
  'go.nextStep': 'अगला क़दम',
  'go.stepOf': 'क़दम {n} / {total}',
  'go.allSteps': 'सभी क़दम',
  'go.noApp': 'ऐप की ज़रूरत नहीं · सुरक्षित लिंक',
  'a11y.title': 'सुगम्यता',
  'a11y.largeText': 'बड़ा टेक्स्ट',
  'a11y.contrast': 'हाई कॉन्ट्रास्ट',
  'a11y.stepFree': 'बिना सीढ़ी के रास्ते',
  'lang.label': 'भाषा',
};

export type Language = 'en' | 'hi';
const dictionaries: Record<Language, Partial<Record<Key, string>>> = { en, hi };

interface I18nState {
  lang: Language;
  setLang(lang: Language): void;
  t(key: Key, vars?: Record<string, string | number>): string;
  /** Tenant text with fallback to the venue's primary language. */
  tenantText(tenant: Tenant, field: 'name' | 'shortSummary' | 'description'): string;
}

const Ctx = createContext<I18nState | null>(null);

export function I18nProvider({
  children,
  initial = 'en',
}: {
  children: ReactNode;
  initial?: Language;
}) {
  const [lang, setLang] = useState<Language>(initial);
  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) => {
      const template = dictionaries[lang][key] ?? en[key] ?? key;
      return vars
        ? template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''))
        : template;
    },
    [lang],
  );
  const tenantText = useCallback(
    (tenant: Tenant, field: 'name' | 'shortSummary' | 'description') =>
      tenant.i18n?.[lang]?.[field] || tenant[field],
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t, tenantText }), [lang, t, tenantText]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

export type TranslationKey = Key;
