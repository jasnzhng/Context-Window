// The floor plans. Claude picks one per room by name ("layout" in its JSON),
// and decay.js mirrors, fills and wears it down. Each {N} marks where an
// object's filename is written: it reads rightward from the marker, so leave
// about 20 blank characters after it. server.js lists the names and hints in
// the prompt, so a new plan here is all it takes to add one.
//
// String.raw keeps backslashes as drawn; the art can't contain a backtick.

const lines = (art) => art.split("\n").slice(1, -1);

export const PLANS = {
  kitchen: {
    hint: "a kitchen, pantry, or anywhere food is made",
    art: lines(String.raw`
+--------------------------------------------------------+
|  ________________                        ___________   |
| | () () () ()    |                      |[] [] [] []|  |
| |________________|   {0}                |___________|  |
| |   |      |     |                      |     |     |  |
| |___|______|_____|                      |_____|_____|  |
|                          .---------.                   |
|   {1}                    |    |    |                   |
|                          |----+----|                   |
|      .--------------.    '---------'                   |
|      |              |                                  |
|      '--.--------.--'     {2}                          |
|         |        |                                     |
|   {3}   '        '                                     |
|                                                        |
+---------------------------    -------------------------+
`),
  },

  bedroom: {
    hint: "a bedroom, dormitory, or any place for sleeping",
    art: lines(String.raw`
+--------------------------------------------------------+
|        .--------------.                 .--------.     |
|        |\            /|                 | ~~~~~~ |     |
|        | \          / |                 | ~~~~~~ |     |
|        |__\________/__|                 '--------'     |
|                                                        |
|   {0}                         {1}                      |
|   .-------------------------.                          |
|   |  ___________            |                .------.  |
|   | (___________)           |                |======|  |
|   |                         |                |======|  |
|   '-------------------------'                |======|  |
|   ||                       ||                '------'  |
|          {2}                     {3}                   |
+--------------------------------------------------------+
`),
  },

  hallway: {
    hint: "a hallway, corridor, tunnel, or passage",
    art: lines(String.raw`
\                                                        /
 \______                                         _______/
 |      |\                                     /|      |
 |  ()  | \                                   / |  ()  |
 |      |  \       .-----------------.       /  |      |
 |      |   |      |                 |      |   |      |
 |______|   |      |                 |      |   |______|
 /          |      |                 |      |          \
/           |______|_________________|______|           \
    /                    {0}                       \
   /    {1}                                         \
  /                       {2}                        \
 /        {3}                                         \
`),
  },

  study: {
    hint: "a study, library, office, archive, or classroom",
    art: lines(String.raw`
+--------------------------------------------------------+
| |==|==|==|==|==|==|==|    .------.    |==|==|==|==|==| |
| |  |  |  |  |  |  |  |    |      |    |  |  |  |  |  | |
| |==|==|==|==|==|==|==|    |      |    |==|==|==|==|==| |
| |  |  |  |  |  |  |  |    '------'    |  |  |  |  |  | |
| |==|==|==|==|==|==|==|                |==|==|==|==|==| |
|   {0}                                                  |
|                ___________________                     |
|               |___________________|         (   )      |
|                ||               ||         _)   (_     |
|   {1}          ||               ||        |_______|    |
|                         {2}                            |
|   {3}                                                  |
+--------------------------------------------------------+
`),
  },

  attic: {
    hint: "an attic, loft, tower, steeple, or any room under a roof",
    art: lines(String.raw`
                 ________________________
               /                          \
             /    []                  []    \
           /                                  \
         /                                      \
       /                                          \
     |     {0}                                      |
     |                         {1}                  |
     |              {2}                             |
     |                                              |
     |   {3}                                        |
     |______________________________________________|
`),
  },

  garden: {
    hint: "a garden, field, park, orchard, or yard",
    art: lines(String.raw`
    .-.            _.-._                      .-.
   (   )         .(     ).                   (   )
  (_____)       (_________)                 (_____)
     |               ||                        |
     |               ||      {0}               |
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
     {1}
             ..         {2}             ..
        ..       ..           ..             ..
     {3}     *        *            *            *
`),
  },

  cave: {
    hint: "a cave, cellar, mine, basement, or anywhere underground",
    art: lines(String.raw`
 __.--._      _.---.__        __.--.______.---.__
/       '--.-'        '-.__.-'                   \
|   /\     {2}                             /\     |
|  /  \    {0}                            /  \    |
| /    \                                 /    \   |
|                  {1}                            |
\            .--.                   .--.         /
 \          (    )                 (    )       /
  '-.        '--'                   '--'     .-'
     '--.          {3}                   .--'
         '-------.______________.-------'
`),
  },

  shore: {
    hint: "a shore, sea, lake, river, harbor, or anywhere near water",
    art: lines(String.raw`
        \  |  /
      --   O   --                      v    v
        /  |  \              v
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   ~~~    {0}       ~~~        ~~~~        ~~~
 ~~~~~~      ~~~~~~      ~~~~~~      ~~~~~~      ~~~~~~
.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:.:
 .  .    {1}       .      .   .          .     .
   .        .   .     {2}     .    .        .     .
 .     {3}     .    .      .        .   .     .
`),
  },

  sky: {
    hint: "another planet, outer space, the sky, or anywhere not on Earth",
    art: lines(String.raw`
       *          .            *                 .
   .        _..._       *            .      ___
          .'     '.            .           (___)    *
  *      :         :                 *
          '._   _.'      .     {0}                .
             '''
    .              *           .            *
 _____/\_______________/\/\__________________/\________
                {1}
     ___                       {2}
    (___)                                .--.
            {3}                         (    )
                                         '--'
`),
  },

  void: {
    hint: "nowhere: emptiness, darkness, fog, or a place that barely exists",
    art: lines(String.raw`

                .
                                     .
          {0}

                          {1}
     .
                                            .
              {2}

                                {3}
                     .
`),
  },
};
