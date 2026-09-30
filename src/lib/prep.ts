/**
 * Does an event need preparing for? A debate tournament does; a dentist appointment doesn't.
 * "yes" → a "Prepare for…" to-do; "no" → just a reminder before it; "ask" → the chat asks him.
 */
const PREP =
  /\b(debate|tournament|competition|contest|fight|bout|tryouts?|audition|recital|performance|concert|show|speech|presentation|pitch|demo|interview|test|exam|quiz|midterm|finals?|sat|act|ap exam|olympiad|hackathon|science fair|fair|project|essay|paper|deadline|application|trip|flight|travel|camp|retreat|conference|race|marathon|weigh-?in)\b/i;
const NO_PREP =
  /\b(dentist|doctor|orthodontist|checkup|check-up|physical|appointment|appt|haircut|barber|dinner|lunch|brunch|breakfast|party|hangout|hang out|hanging|chilling|going out|talk|movies?|call|facetime|class|practice|training|service|mass|church|birthday|visit|pickup|pick up|drop off|meeting|club|volunteering)\b/i;

export function needsPrep(title: string): "yes" | "no" | "ask" {
  if (PREP.test(title)) return "yes";
  if (NO_PREP.test(title)) return "no";
  return "ask";
}
