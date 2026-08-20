export declare function DiffView({ filePath, before, after }: {
    filePath: string;
    before: string;
    after: string;
}): import("react/jsx-runtime").JSX.Element;
/**
 * A unified diff that ALREADY EXISTS, coloured.
 *
 * `DiffView` above cannot do this job and the difference is the whole reason this
 * exists. It takes a file's `before` and `after` CONTENTS and computes the patch
 * itself with `structuredPatch`. The git endpoint
 * (`GET /sessions/{id}/git?repo=…`) does not return two versions of a file — it
 * returns `diff_unstaged` and `diff_staged`, which are the output of `git diff`,
 * already unified and possibly spanning many files. There is nothing to diff.
 *
 * So this renders what it is given, line by line, using the same `bc-diff-*`
 * classes and therefore the same colours as the tool cards. What it adds over the
 * `<pre>` the Git pane used to draw is only that: `+` green, `-` red, `@@` and the
 * `diff --git` / `index` / `+++` / `---` file headers set apart from the body.
 *
 * ⚠️ Order matters in the classifier below. A unified diff's `+++ b/path` and
 * `--- a/path` headers start with `+` and `-`, so testing for additions first
 * paints every file header as an added line — which is exactly wrong at the one
 * place a reader is trying to see where one file ends and the next begins.
 */
export declare function UnifiedDiffView({ diff }: {
    diff: string;
}): import("react/jsx-runtime").JSX.Element;
/** Which class a single line of a unified diff gets. Exported for the test that
 *  pins the header-before-sign ordering. */
export declare function unifiedDiffLineClass(line: string): string;
//# sourceMappingURL=DiffView.d.ts.map