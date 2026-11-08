/**
 * The permission manifest the YTC portal reads (GET /portal-manifest.json) to
 * draw one checkbox per permission, and a door picker for the `doors` scope, on
 * each staff member's page. Keep `PERMS` (lib/portal-core) and this in step.
 */
import { doorScopeKey, type Perm } from "./portal-core";

export const PORTAL_APP_ID = "doors";
export const MANIFEST_VERSION = 1;

interface PermDef {
  key: Perm;
  label: string;
  label_he: string;
  description: string;
  description_he: string;
}

export const PERMISSION_DEFS: PermDef[] = [
  {
    key: "view",
    label: "View people and doors",
    label_he: "צפייה באנשים ובדלתות",
    description: "See the home dashboard, door status and the Directory of everyone on the doors (with photos).",
    description_he: "צפייה בלוח הבית, במצב הדלתות ובספריית כל האנשים בדלתות (כולל תמונות).",
  },
  {
    key: "enroll",
    label: "Add people / enroll faces",
    label_he: "הוספת אנשים / רישום פנים",
    description: "Add a person with a face photo, replace someone's photo, and re-send a person to the door.",
    description_he: "הוספת אדם עם תמונת פנים, החלפת תמונה של אדם ושליחה חוזרת לדלת.",
  },
  {
    key: "review",
    label: "Review incoming photos",
    label_he: "בדיקת תמונות נכנסות",
    description: "Work the Review Queue: approve or reject emailed photos and denied door scans (approving enrolls the person).",
    description_he: "טיפול בתור הבדיקה: אישור או דחייה של תמונות שהגיעו במייל ושל סריקות שנדחו בדלת (אישור רושם את האדם).",
  },
  {
    key: "roster",
    label: "Manage the roster",
    label_he: "ניהול רשימת התלמידים",
    description: "See, upload and edit the incoming-talmidim roster and download roster photos.",
    description_he: "צפייה, העלאה ועריכה של רשימת התלמידים הנכנסים והורדת תמונות הרשימה.",
  },
  {
    key: "edit_access",
    label: "Change access",
    label_he: "שינוי הרשאות כניסה",
    description: "Give a person access to another door, and edit their name, PIN code and group (which sets their times).",
    description_he: "מתן גישה לדלת נוספת, ועריכת שם, קוד PIN וקבוצה (שקובעת את שעות הכניסה).",
  },
  {
    key: "remove",
    label: "Remove people / revoke",
    label_he: "הסרת אנשים / ביטול גישה",
    description: "Take a person off a door or off every door.",
    description_he: "הסרת אדם מדלת אחת או מכל הדלתות.",
  },
  {
    key: "temp_pins",
    label: "Temporary PIN codes",
    label_he: "קודי PIN זמניים",
    description: "See, create, extend and revoke time-limited guest PIN codes.",
    description_he: "צפייה, יצירה, הארכה וביטול של קודי PIN זמניים לאורחים.",
  },
  {
    key: "logs",
    label: "Activity log",
    label_he: "יומן פעילות",
    description: "See who changed what, when and from where.",
    description_he: "צפייה במי שינה מה, מתי ומאיפה.",
  },
  {
    key: "admin",
    label: "Settings and hardware",
    label_he: "הגדרות וחומרה",
    description: "Add and remove doors, door schedules and local staff logins. Includes every other permission, on every door.",
    description_he: "הוספה והסרה של דלתות, לוחות זמנים ומשתמשי צוות מקומיים. כולל את כל ההרשאות האחרות, בכל הדלתות.",
  },
];

export const TILES = [
  { key: "main", label: "Door Access", label_he: "בקרת כניסה", path: "/", icon: "door-open", perm: "view" },
  { key: "directory", label: "People", label_he: "אנשים", path: "/directory", icon: "users", perm: "view" },
  { key: "enroll", label: "Add Person", label_he: "הוספת אדם", path: "/enroll", icon: "user-plus", perm: "enroll" },
  { key: "add_face", label: "Add a face", label_he: "הוספת פנים", path: "/add-face", icon: "scan-face", perm: "enroll" },
  { key: "review", label: "Review Queue", label_he: "תור בדיקה", path: "/review", icon: "scan-face", perm: "review" },
  { key: "roster", label: "Roster", label_he: "רשימת תלמידים", path: "/roster", icon: "clipboard-list", perm: "roster" },
  { key: "temp_pins", label: "Temp PINs", label_he: "קודים זמניים", path: "/temp-pins", icon: "key-round", perm: "temp_pins" },
  { key: "logs", label: "Activity Log", label_he: "יומן פעילות", path: "/logs", icon: "scroll-text", perm: "logs" },
  { key: "settings", label: "Settings", label_he: "הגדרות", path: "/admin/settings", icon: "settings", perm: "admin" },
] satisfies {
  key: string;
  label: string;
  label_he: string;
  path: string;
  icon: string;
  perm: Perm;
}[];

/** Hebrew names for the doors we know; anything else falls back to its own name. */
const HE_DOOR_NAMES: Record<string, string> = {
  front: "דלת ראשית",
  "front-door": "דלת ראשית",
  "main-entrance": "כניסה ראשית",
  kitchen: "מטבח",
  "kitchen-front": "מטבח – קדמית",
  "kitchen-back": "מטבח – אחורית",
};

export function buildManifest(doors: { key: string; name: string }[]) {
  return {
    id: PORTAL_APP_ID,
    name: "Door Access",
    name_he: "בקרת כניסה",
    version: MANIFEST_VERSION,
    tiles: TILES,
    permissions: PERMISSION_DEFS,
    scopes: [
      {
        key: "doors",
        label: "Doors they can manage",
        label_he: "דלתות שהוא יכול לנהל",
        description:
          "Without a door limit they get every door. With one, only the doors ticked (none ticked = no doors). Applies to people, access, photos and temp PINs. Admins are never limited.",
        description_he:
          "ללא הגבלת דלתות — כל הדלתות. עם הגבלה — רק הדלתות שסומנו (אף אחת לא סומנה = אין דלתות). חל על אנשים, הרשאות, תמונות וקודים זמניים. מנהלים אינם מוגבלים.",
        options: doors.map((d) => ({
          key: doorScopeKey(d.key),
          label: d.name,
          label_he: HE_DOOR_NAMES[d.key] ?? d.name,
        })),
      },
    ],
  };
}
