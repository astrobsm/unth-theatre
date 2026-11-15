/**
 * Parse an uploaded draft and hand back a PREVIEW. Nothing is stored.
 *
 * The two steps are deliberately separate. A parse that merges two sections
 * removes a question the committee was supposed to answer, and no screen
 * downstream shows that it is missing — the dashboard simply reports that fewer
 * people commented on section 7. So the owner has to look at the tree and the
 * detected values before any of it becomes a round.
 *
 * THE FILE'S BYTES ARE NOT KEPT. What persists (in POST /api/policy/documents)
 * is the parsed sections, which are the document as far as every screen in this
 * module is concerned. Keeping the .docx too would mean replicating a couple of
 * megabytes between the two nodes for no reader, and registering a blob column
 * as held back from the sync journal.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { importFromDocx, importFromMarkdown } from '@/lib/policy/import';
import { requirePolicyOwner } from '@/lib/policy/guard';

export const dynamic = 'force-dynamic';

/** A policy draft is text. 8 MB is a generous ceiling for a Word export. */
const MAX_BYTES = 8 * 1024 * 1024;

const pastedSchema = z.object({
  markdown: z.string().min(1).max(MAX_BYTES),
  fileName: z.string().max(300).optional(),
});

export async function POST(request: NextRequest) {
  const { error, actor } = await requirePolicyOwner();
  if (error || !actor) return error;

  try {
    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) {
        return NextResponse.json({ error: 'Attach the exported draft' }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: 'That file is larger than 8 MB. A policy draft should be well under it.' },
          { status: 413 },
        );
      }

      const name = file.name ?? 'draft';
      const buffer = Buffer.from(await file.arrayBuffer());
      const isDocx = /\.docx$/i.test(name)
        || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      if (isDocx) {
        const imported = await importFromDocx(buffer);
        return NextResponse.json({
          ok: true, sourceFormat: 'DOCX', fileName: name, ...imported,
        });
      }

      if (/\.docx?$/i.test(name) && !isDocx) {
        // The old binary .doc format is not OOXML and mammoth cannot read it.
        return NextResponse.json(
          {
            error:
              'That looks like an old-format .doc file, which cannot be read. Open it in '
              + 'Word and save as .docx, or export as Markdown.',
          },
          { status: 415 },
        );
      }

      const imported = importFromMarkdown(buffer.toString('utf8'));
      return NextResponse.json({
        ok: true, sourceFormat: 'MARKDOWN', fileName: name, ...imported,
      });
    }

    const parsed = pastedSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Paste the draft, or attach the file' }, { status: 400 });
    }

    const imported = importFromMarkdown(parsed.data.markdown);
    return NextResponse.json({
      ok: true,
      sourceFormat: parsed.data.fileName ? 'MARKDOWN' : 'PASTED',
      fileName: parsed.data.fileName ?? null,
      ...imported,
    });
  } catch (err) {
    console.error('[policy/import] failed', err);
    return NextResponse.json(
      { error: 'Could not read that file. If it is a Word export, try saving it as .docx again.' },
      { status: 500 },
    );
  }
}
