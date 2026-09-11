/* The evolution sprite cycle, ported from pret/pokefirered.

   CycleEvolutionMonSprite (src/evolution_graphics.c) fills both sprites'
   palettes with RGB_WHITE and then runs a scale tug-of-war between them. Two
   tasks alternate, one frame each time they hand over:

     EvoTask_ChooseNextEvoSpriteAnim   stop at speed 128, else speed += 2 and
                                       flip which sprite is growing
     EvoTask_ShrinkOrExpandEvoSprites  one frame: the growing sprite walks up
                                       toward 256, the shrinking one down to
                                       16, both by `speed`; when both have
                                       arrived, hand back

   The acceleration is a property of that loop rather than an easing curve laid
   over it: the first swap takes 24 frames and the last takes 2.

   Kept pure and outside the component so tools/check.mjs can assert the shape
   of the whole animation without a browser - which matters, because rAF is
   throttled in headless Chrome and a screenshot can never catch this. */

const MIN = 16;
const MAX = 256;
const SPEED_START = 8;
const SPEED_STEP = 2;
const SPEED_END = 128;

export const SCALE_MAX = MAX;

/* Every frame of the cycle as [preScale, postScale], in 1/256ths. Deterministic
   and only ~400 entries, so it is built once and indexed rather than stepped. */
export function evoCycleFrames() {
  const frames = [];
  let pre = MAX;
  let post = MIN;
  let speed = SPEED_START;
  let toPost = false;

  for (;;) {
    // EvoTask_ChooseNextEvoSpriteAnim — costs a frame, like every task handover.
    if (speed === SPEED_END) break;
    speed += SPEED_STEP;
    toPost = !toPost;
    frames.push([pre, post]);

    // EvoTask_ShrinkOrExpandEvoSprites, once per frame until both have arrived.
    for (;;) {
      let settled = 0;
      if (toPost) {
        if (post < MAX - speed) post += speed;
        else { post = MAX; settled++; }
        if (pre > MIN + speed) pre -= speed;
        else { pre = MIN; settled++; }
      } else {
        if (pre < MAX - speed) pre += speed;
        else { pre = MAX; settled++; }
        if (post > MIN + speed) post -= speed;
        else { post = MIN; settled++; }
      }
      frames.push([pre, post]);
      if (settled === 2) break;
    }
  }

  /* PreEvoInvisible_PostEvoVisible_KillTask: the last swap can land on either
     sprite, so the end state is stated outright rather than inherited. */
  frames.push([MIN, MAX]);
  return frames;
}

// How many swaps the cycle makes — one per speed step from 10 to 128.
export const EVO_SWAPS = (SPEED_END - SPEED_START) / SPEED_STEP;
