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
  roster: {
    title: string;
    subtitle: string;
    chooseFile: string;
    parsing: string;
    rowsFound: string; // "{count}"
    mapping: string;
    colStudentId: string;
    colName: string;
    colShiur: string;
    colPhone: string;
    colAliases: string;
    aliasesHint: string;
    none: string;
    preview: string;
    import: string;
    importing: string;
    back: string;
    needNameId: string;
    imported: string; // "{created}" "{updated}"
    parseError: string;
    empty: string;
  };
  review: {
    title: string;
    subtitle: string;
    empty: string;
    from: string;
    candidates: string;
    approveAs: string;
    reject: string;
    approving: string;
    rejecting: string;
    otherId: string;
    otherIdPlaceholder: string;
    matchById: string;
    noFaceWarn: string;
    rosterMissing: string;
    approvedMsg: string; // "{name}" "{userId}"
    noCandidates: string;
    sourceDoor: string;
    sourceEmail: string;
    filterAll: string;
    filterEmail: string;
    filterDenied: string;
    nameLabel: string;
    namePlaceholder: string;
    addByName: string;
    needName: string;
    orMatchRoster: string;
  };
  directory: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    empty: string;
    name: string;
    studentId: string;
    shiur: string;
    doorId: string;
    status: string;
    repush: string;
    remove: string;
    replacePhoto: string;
    download: string;
    confirmRemove: string;
    confirmRemoveLegacy: string;
    statusDraft: string;
    statusPending: string;
    statusPushed: string;
    statusFailed: string;
    statusRemoved: string;
    viewDevice: string;
    deviceTitle: string;
    deviceSubtitle: string;
    loadingDevice: string;
    searchDevice: string;
    face: string;
    yes: string;
    no: string;
    managedHere: string;
    legacy: string;
    totalOnDoor: string; // "{n}"
    back: string;
  };
  settings: {
    title: string;
    subtitle: string;
    deviceTarget: string;
    scheduleDefault: string;
    pushTransport: string;
    configured: string;
    notConfigured: string;
    tunnelMode: string;
    auditTitle: string;
    auditEmpty: string;
    actor: string;
    action: string;
    target: string;
    when: string;
    system: string;
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
    queuedTitle: "{name} is on the door",
    queuedBody:
      "Door ID {userId} — the face is confirmed on the scanner. They can enter now.",
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
  roster: {
    title: "Roster",
    subtitle:
      "Upload the incoming-talmid list (CSV or Excel). We match emailed photos against it.",
    chooseFile: "Choose a CSV or Excel file",
    parsing: "Reading file…",
    rowsFound: "{count} rows found. Map the columns, then import.",
    mapping: "Column mapping",
    colStudentId: "Student ID column",
    colName: "Name column",
    colShiur: "Shiur column",
    colPhone: "Phone column",
    colAliases: "Aliases column",
    aliasesHint: "Optional — comma-separated alternate spellings (Yitzchok/Yitzchak).",
    none: "— none —",
    preview: "Preview",
    import: "Import roster",
    importing: "Importing…",
    back: "Choose a different file",
    needNameId: "Map both a Student ID column and a Name column.",
    imported: "Imported: {created} added, {updated} updated.",
    parseError: "Couldn't read that file. Use CSV or .xlsx with a header row.",
    empty: "That file has no data rows.",
  },
  review: {
    title: "Review queue",
    subtitle:
      "Emailed photos matched to the roster. Approve the right person, or reject a bad photo.",
    empty: "Nothing to review right now.",
    from: "From",
    candidates: "Roster matches",
    approveAs: "Approve as",
    reject: "Reject",
    approving: "Approving…",
    rejecting: "Rejecting…",
    otherId: "Match by a different student ID",
    otherIdPlaceholder: "Student ID",
    matchById: "Approve",
    noFaceWarn: "Face check failed — review before approving.",
    rosterMissing: "No roster entry with that student ID.",
    approvedMsg: "Approved {name} → door ID {userId}.",
    noCandidates: "No roster matches. Enter a student ID to match.",
    sourceDoor: "Door scan",
    sourceEmail: "Email",
    filterAll: "All",
    filterEmail: "Email",
    filterDenied: "Denied scans",
    nameLabel: "Name",
    namePlaceholder: "Full name",
    addByName: "Add",
    needName: "Enter a name.",
    orMatchRoster: "or match to the roster",
  },
  directory: {
    title: "Directory",
    subtitle:
      "People this system enrolled on the door (automation IDs only). The 832 legacy records are not shown.",
    searchPlaceholder: "Search name or student ID…",
    empty: "No enrollees yet.",
    name: "Name",
    studentId: "Student ID",
    shiur: "Shiur",
    doorId: "Door ID",
    status: "Status",
    repush: "Re-push",
    remove: "Remove",
    replacePhoto: "Replace photo",
    download: "Download",
    confirmRemove: "Remove this person from the door?",
    confirmRemoveLegacy:
      "⚠ This is a PRE-EXISTING record, not added by this system. Deleting it from the door is permanent and could lock them out. Are you sure?",
    statusDraft: "Draft",
    statusPending: "Queued",
    statusPushed: "On door",
    statusFailed: "Failed",
    statusRemoved: "Removed",
    viewDevice: "All on the door →",
    deviceTitle: "Everyone on the door",
    deviceSubtitle: "The full device directory, live — legacy + this system's records.",
    loadingDevice: "Loading the door directory…",
    searchDevice: "Search name or user ID…",
    face: "Face",
    yes: "Yes",
    no: "No",
    managedHere: "Managed here",
    legacy: "Legacy",
    totalOnDoor: "{n} people on the door",
    back: "← Back to directory",
  },
  settings: {
    title: "Settings",
    subtitle: "Device target, defaults, and the audit log.",
    deviceTarget: "Door target",
    scheduleDefault: "Default schedule",
    pushTransport: "Push transport",
    configured: "Configured",
    notConfigured: "Not configured",
    tunnelMode: "Cloudflare tunnel (cloud push)",
    auditTitle: "Recent activity",
    auditEmpty: "No activity yet.",
    actor: "Who",
    action: "Action",
    target: "Target",
    when: "When",
    system: "system",
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
    queuedTitle: "{name} נמצא בדלת",
    queuedBody: "מזהה דלת {userId} — הפנים אושרו בסורק. ניתן להיכנס עכשיו.",
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
  roster: {
    title: "רשימת תלמידים",
    subtitle: "העלו את רשימת התלמידים הנכנסים (CSV או Excel). נשתמש בה להתאמת תמונות מהמייל.",
    chooseFile: "בחרו קובץ CSV או Excel",
    parsing: "קורא קובץ…",
    rowsFound: "נמצאו {count} שורות. מפו את העמודות וייבאו.",
    mapping: "מיפוי עמודות",
    colStudentId: "עמודת מספר תלמיד",
    colName: "עמודת שם",
    colShiur: "עמודת שיעור",
    colPhone: "עמודת טלפון",
    colAliases: "עמודת כינויים",
    aliasesHint: "רשות — איותים חלופיים מופרדים בפסיק (Yitzchok/Yitzchak).",
    none: "— ללא —",
    preview: "תצוגה מקדימה",
    import: "ייבוא רשימה",
    importing: "מייבא…",
    back: "בחירת קובץ אחר",
    needNameId: "יש למפות גם עמודת מספר תלמיד וגם עמודת שם.",
    imported: "יובאו: {created} נוספו, {updated} עודכנו.",
    parseError: "לא ניתן לקרוא את הקובץ. השתמשו ב‑CSV או ב‑xlsx עם שורת כותרת.",
    empty: "אין שורות נתונים בקובץ.",
  },
  review: {
    title: "תור לאישור",
    subtitle: "תמונות שהתקבלו במייל והותאמו לרשימה. אשרו את האדם הנכון, או דחו תמונה לא תקינה.",
    empty: "אין כרגע פריטים לאישור.",
    from: "מאת",
    candidates: "התאמות מהרשימה",
    approveAs: "אישור בתור",
    reject: "דחייה",
    approving: "מאשר…",
    rejecting: "דוחה…",
    otherId: "התאמה לפי מספר תלמיד אחר",
    otherIdPlaceholder: "מספר תלמיד",
    matchById: "אישור",
    noFaceWarn: "בדיקת הפנים נכשלה — בדקו לפני אישור.",
    rosterMissing: "אין ברשימה תלמיד עם מספר זה.",
    approvedMsg: "אושר {name} ← מזהה דלת {userId}.",
    noCandidates: "אין התאמות ברשימה. הזינו מספר תלמיד להתאמה.",
    sourceDoor: "סריקה בדלת",
    sourceEmail: "מייל",
    filterAll: "הכל",
    filterEmail: "מייל",
    filterDenied: "סריקות שנדחו",
    nameLabel: "שם",
    namePlaceholder: "שם מלא",
    addByName: "הוספה",
    needName: "יש להזין שם.",
    orMatchRoster: "או התאמה לרשימה",
  },
  directory: {
    title: "מדריך",
    subtitle: "האנשים שהמערכת רשמה בדלת (מזהי אוטומציה בלבד). 832 הרשומות הישנות אינן מוצגות.",
    searchPlaceholder: "חיפוש לפי שם או מספר תלמיד…",
    empty: "אין עדיין רשומים.",
    name: "שם",
    studentId: "מספר תלמיד",
    shiur: "שיעור",
    doorId: "מזהה דלת",
    status: "סטטוס",
    repush: "שליחה מחדש",
    remove: "הסרה",
    replacePhoto: "החלפת תמונה",
    download: "הורדה",
    confirmRemove: "להסיר אדם זה מהדלת?",
    confirmRemoveLegacy:
      "⚠ זוהי רשומה קיימת מראש, שלא נוספה על ידי המערכת. מחיקתה מהדלת היא לצמיתות ועלולה לחסום כניסה. בטוחים?",
    statusDraft: "טיוטה",
    statusPending: "בתור",
    statusPushed: "בדלת",
    statusFailed: "נכשל",
    statusRemoved: "הוסר",
    viewDevice: "כל מי שבדלת ←",
    deviceTitle: "כל מי שבדלת",
    deviceSubtitle: "ספריית המכשיר המלאה, בזמן אמת — רשומות ישנות + רשומות המערכת.",
    loadingDevice: "טוען את ספריית הדלת…",
    searchDevice: "חיפוש לפי שם או מזהה…",
    face: "פנים",
    yes: "כן",
    no: "לא",
    managedHere: "מנוהל כאן",
    legacy: "ישן",
    totalOnDoor: "{n} אנשים בדלת",
    back: "← חזרה למדריך",
  },
  settings: {
    title: "הגדרות",
    subtitle: "יעד המכשיר, ברירות מחדל, ויומן הפעילות.",
    deviceTarget: "יעד הדלת",
    scheduleDefault: "לוח זמנים ברירת מחדל",
    pushTransport: "אופן השליחה",
    configured: "מוגדר",
    notConfigured: "לא מוגדר",
    tunnelMode: "מנהרת Cloudflare (שליחה מהענן)",
    auditTitle: "פעילות אחרונה",
    auditEmpty: "אין עדיין פעילות.",
    actor: "מי",
    action: "פעולה",
    target: "יעד",
    when: "מתי",
    system: "מערכת",
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
