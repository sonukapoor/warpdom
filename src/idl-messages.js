// WebIDL conversion errors in the words of the jsdom release modeled
// (black box, 30.1.3 and 31.0.1; #269). path: the dictionary members from
// the argument in, outermost first ([] for the argument itself).
//   before 31: parameter 2 has member 'a' that has member 'x' that is not …
//              parameter 4 'v' is not a valid enumeration value for Type
//   from 31:   parameter 2's 'a' member's 'x' member is not …
//              parameter 4 must be one of: "a", "b". Received: "v".
// words31: compat.idlMessages31 (window-features.js).

function subject(words31, param, path) {
  let out = `parameter ${param}`;
  for (const name of path) out += words31 ? `'s '${name}' member` : ` has member '${name}' that`;
  return out;
}

// rest: what is wrong, as "is not an object."
export const memberError = (words31, param, path, rest) => `${subject(words31, param, path)} ${rest}`;

// value: the string given; values: the enumeration's values, in order.
export const enumError = (words31, param, path, value, values, type) =>
  words31
    ? `${subject(true, param, path)} must be one of: ${values.map((v) => `"${v}"`).join(', ')}. Received: "${value}".`
    : `${subject(false, param, path)} '${value}' is not a valid enumeration value for ${type}`;
