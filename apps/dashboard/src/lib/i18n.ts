/**
 * Lightweight i18n — Hebrew (primary, RTL) + English. No routing-based locales:
 * the locale comes from a cookie override, falling back to the browser's
 * Accept-Language (see lib/locale.ts). The whole dictionary is small enough to
 * ship to the client via a context provider (lib/LocaleProvider).
 *
 * Hebrew is the kosher-market primary locale — keep these translations correct
 * and natural. Mark anything uncertain with a TODO for a native speaker.
 */
export type Locale = "he" | "en";
export const LOCALES: Locale[] = ["he", "en"];
export const DEFAULT_LOCALE: Locale = "he";
export const LOCALE_COOKIE = "ytc_locale";

export function isRtl(locale: Locale): boolean {
  return locale === "he";
}

export interface Dict {
  dir: "rtl" | "ltr";
  localeName: string;
  brand: string;
  nav: {
    home: string;
    enroll: string;
    review: string;
    roster: string;
    directory: string;
    staff: string;
    settings: string;
    signOut: string;
    language: string;
  };
  login: {
    title: string;
    subtitle: string;
    email: string;
    password: string;
    signIn: string;
    signingIn: string;
    badCreds: string;
    invalid: string;
    footer: string;
  };
  home: {
    welcome: string; // "{name}"
    subtitle: string;
    enrolled: string;
    awaitingReview: string;
    inQueue: string;
    pushFailed: string;
    addTitle: string;
    addBody: string;
    reviewTitle: string;
    reviewBody: string;
  };
  enroll: {
    title: string;
    subtitle: string;
    name: string;
    studentId: string;
    shiur: string;
    phone: string;
    uploadPhoto: string;
    useWebcam: string;
    capture: string;
    preview: string;
    addPhoto: string;
    enroll: string;
    enrolling: string;
    camError: string;
    noFace: string;
    queuedTitle: string; // "{name}"
    queuedBody: string; // "{userId}"
    addAnother: string;
    needPhoto: string;
    tooLarge: string;
  };
  staff: {
    title: string;
    subtitle: string;
    name: string;
    email: string;
    role: string;
    status: string;
    active: string;
    disabled: string;
    you: string;
    disable: string;
    enable: string;
    createTitle: string;
    tempPassword: string;
    roleStaff: string;
    roleAdmin: string;
    create: string;
    creating: string;
    exists: string;
    created: string; // "{email}"
    pwTooShort: string;
  };
  common: {
    comingSoon: string;
    error: string;
  };
}

const en: Dict = {
  dir: "ltr",
  localeName: "English",
  brand: "YTC Entry",
  nav: {
    home: "Home",
    enroll: "Add Person",
    review: "Review Queue",
    roster: "Roster",
    directory: "Directory",
    staff: "Staff",
    settings: "Settings",
    signOut: "Sign out",
    language: "Language",
  },
  login: {
    title: "YTC Entry",
    subtitle: "Face enrollment dashboard",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    badCreds: "Wrong email or password, or login disabled.",
    invalid: "Enter a valid email and password.",
    footer: "Logins are issued by IT. Contact the office admin for access.",
  },
  home: {
    welcome: "Welcome, {name}",
    subtitle:
      "Enroll talmidim on the door reader — upload a photo or approve an emailed one.",
    enrolled: "Enrolled on door",
    awaitingReview: "Awaiting review",
    inQueue: "In push queue",
    pushFailed: "Push failed",
    addTitle: "Add a person",
    addBody: "Type a name, snap or upload a photo, and send them to the door.",
    reviewTitle: "Review emailed photos",
    reviewBody:
      "Match incoming photos to the roster and approve them for enrollment.",
  },
  enroll: {
    title: "Add a person",
    subtitle:
      "Enter the name, then upload a photo or capture one from the webcam. We check the face and send them to the door.",
    name: "Name",
    studentId: "Student ID",
    shiur: "Shiur",
    phone: "Phone",
    uploadPhoto: "Upload photo",
    useWebcam: "Use webcam",
    capture: "Capture",
    preview: "Photo preview",
    addPhoto: "Add a photo to continue",
    enroll: "Enroll",
    enrolling: "Enrolling…",
    camError: "Couldn't open the webcam. Check browser permissions.",
    noFace: "Add a photo — upload one or capture from the webcam.",
    queuedTitle: "{name} is queued for the door",
    queuedBody:
      "Door ID {userId}. The push worker will write the face and confirm it shortly — watch the Directory for the status.",
    addAnother: "Add another",
    needPhoto: "Add a photo to continue",
    tooLarge: "That image is too large (max 15MB).",
  },
  staff: {
    title: "Staff logins",
    subtitle:
      "Create and disable logins. Passwords are set here and handed out — there is no email sign-up or reset.",
    name: "Name",
    email: "Email",
    role: "Role",
    status: "Status",
    active: "Active",
    disabled: "Disabled",
    you: "you",
    disable: "Disable",
    enable: "Enable",
    createTitle: "Create a login",
    tempPassword: "Temporary password",
    roleStaff: "Staff (enroll, upload, approve)",
    roleAdmin: "Admin (+ device, settings, logins)",
    create: "Create login",
    creating: "Creating…",
    exists: "A login with that email already exists.",
    created: "Created login for {email}.",
    pwTooShort: "Password must be at least 8 characters.",
  },
  common: {
    comingSoon: "Coming soon.",
    error: "Something went wrong. Please try again.",
  },
};

const he: Dict = {
  dir: "rtl",
  localeName: "עברית",
  brand: "YTC Entry",
  nav: {
    home: "בית",
    enroll: "הוספת אדם",
    review: "תור לאישור",
    roster: "רשימת תלמידים",
    directory: "מדריך",
    staff: "צוות",
    settings: "הגדרות",
    signOut: "התנתקות",
    language: "שפה",
  },
  login: {
    title: "YTC Entry",
    subtitle: "מערכת רישום פנים",
    email: "אימייל",
    password: "סיסמה",
    signIn: "כניסה",
    signingIn: "מתחבר…",
    badCreds: "אימייל או סיסמה שגויים, או שהחשבון מושבת.",
    invalid: "יש להזין אימייל וסיסמה תקינים.",
    footer: "החשבונות מונפקים על ידי ה‑IT. לפנות למנהל המשרד לקבלת גישה.",
  },
  home: {
    welcome: "ברוך הבא, {name}",
    subtitle: "רישום תלמידים בקורא הדלת — העלאת תמונה או אישור תמונה שהתקבלה במייל.",
    enrolled: "רשומים בדלת",
    awaitingReview: "ממתינים לאישור",
    inQueue: "בתור לשליחה",
    pushFailed: "שליחה נכשלה",
    addTitle: "הוספת אדם",
    addBody: "הקלידו שם, צלמו או העלו תמונה, ושלחו אותו לדלת.",
    reviewTitle: "אישור תמונות מהמייל",
    reviewBody: "התאמת תמונות נכנסות לרשימה ואישורן לרישום.",
  },
  enroll: {
    title: "הוספת אדם",
    subtitle:
      "הזינו את השם, ואז העלו תמונה או צלמו מהמצלמה. אנו בודקים את הפנים ושולחים אותו לדלת.",
    name: "שם",
    studentId: "מספר תלמיד",
    shiur: "שיעור",
    phone: "טלפון",
    uploadPhoto: "העלאת תמונה",
    useWebcam: "שימוש במצלמה",
    capture: "צילום",
    preview: "תצוגת תמונה",
    addPhoto: "הוסיפו תמונה כדי להמשיך",
    enroll: "רישום",
    enrolling: "רושם…",
    camError: "לא ניתן לפתוח את המצלמה. בדקו את הרשאות הדפדפן.",
    noFace: "הוסיפו תמונה — העלו אחת או צלמו מהמצלמה.",
    queuedTitle: "{name} בתור לדלת",
    queuedBody:
      "מזהה דלת {userId}. עובד השליחה יכתוב את הפנים ויאשר בקרוב — עקבו אחר הסטטוס במדריך.",
    addAnother: "הוספת אדם נוסף",
    needPhoto: "הוסיפו תמונה כדי להמשיך",
    tooLarge: "התמונה גדולה מדי (עד 15MB).",
  },
  staff: {
    title: "חשבונות צוות",
    subtitle:
      "יצירה והשבתה של חשבונות. הסיסמאות נקבעות כאן ומחולקות — אין הרשמה או איפוס במייל.",
    name: "שם",
    email: "אימייל",
    role: "תפקיד",
    status: "סטטוס",
    active: "פעיל",
    disabled: "מושבת",
    you: "אתה",
    disable: "השבתה",
    enable: "הפעלה",
    createTitle: "יצירת חשבון",
    tempPassword: "סיסמה זמנית",
    roleStaff: "צוות (רישום, העלאה, אישור)",
    roleAdmin: "מנהל (+ מכשיר, הגדרות, חשבונות)",
    create: "יצירת חשבון",
    creating: "יוצר…",
    exists: "כבר קיים חשבון עם אימייל זה.",
    created: "נוצר חשבון עבור {email}.",
    pwTooShort: "הסיסמה חייבת להכיל לפחות 8 תווים.",
  },
  common: {
    comingSoon: "בקרוב.",
    error: "משהו השתבש. נסו שוב.",
  },
};

const DICTS: Record<Locale, Dict> = { he, en };

export function getDictionary(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

/** Interpolate "{name}"-style placeholders. Keeps the dict fully serializable
 *  so it can cross the server→client boundary in the context provider. */
export function fmt(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}
