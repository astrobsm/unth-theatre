/**
 * Lengthen the shot-2 transition lines.
 *
 * Every script pivoted from its hook with a single short sentence — two to four
 * seconds of speech. On the camera-move scripts that would be fine; these are
 * AI-generated talking heads billed per second with a minimum per clip, so a
 * three-second shot costs about what a ten-second one costs and says a third as
 * much. Each pivot now carries an actual idea.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'role-scripts-content.js');

const SWAPS = [
  [
    'So let me show you how I book now, and where the four seconds actually matter.',
    'So let me show you how I book now, and where those four seconds actually go. It is not the typing. It is one thing I do before I press save, and it is the difference between a list that runs and a patient sent back to the ward still hungry.',
  ],
  [
    'That is what Team Check-in is for, and it takes two seconds.',
    'That is what Team Check-in is for, and it takes about two seconds. It is the smallest thing in this entire application, and I would argue it saves more theatre minutes than anything else I do all day.',
  ],
  [
    'Four screens carry my whole day, and none of them takes long.',
    'Four screens carry my whole day and none of them takes long. Between them they answer where I am working, whether my room is ready, where the shared equipment went, and what is broken.',
  ],
  [
    'Two things stop that, and the first one takes one tap.',
    'Two things stop that from ever happening, and the first is a single tap. The second is a list I work exactly the same way every time, no matter who is on duty or how far behind we are running.',
  ],
  [
    'My day runs in five steps, and the first one happens the evening before.',
    'My day runs in five steps, and the first happens the evening before, while I can still do something about whatever I find. That is the whole trick of this job.',
  ],
  [
    'Now she is on my screen before the trolley arrives. Let me show you the four things I do.',
    'Now she is on my screen before the trolley even reaches my door. Let me show you the four things I do, in the order I do them, from the moment she comes through it.',
  ],
  [
    'So let me show you the whole thing, and I will tell you exactly where it goes wrong.',
    'So let me show you the whole thing, start to finish, and I will tell you exactly where it goes wrong. It is always the same place, and it is not the part anybody expects.',
  ],
];

let src = fs.readFileSync(FILE, 'utf8');
let done = 0;
for (const [from, to] of SWAPS) {
  if (src.includes(from)) {
    src = src.replace(from, to);
    done += 1;
  } else {
    console.log('NOT FOUND:', from.slice(0, 55));
  }
}
fs.writeFileSync(FILE, src, 'utf8');
console.log(`replaced ${done} of ${SWAPS.length}`);
