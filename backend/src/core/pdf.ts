import { formatAnswer, type QuizDraft } from "@quizqrafter/shared";
import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { t } from "../i18n";

const LETTERS = "ABCDEF";

// PDF's built-in Helvetica only covers Western European text, so Greek letters, subscripts
// and math symbols came out garbled. DejaVu Sans covers them and is embedded instead.
const require = createRequire(import.meta.url);
const REGULAR = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const BOLD = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

// Renders a quiz as a PDF: the questions, then the answer key on a new page.
export function renderQuizPdf(quiz: QuizDraft): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 56 });
    doc.registerFont("Regular", REGULAR);
    doc.registerFont("Bold", BOLD);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Bold").fontSize(20).text(quiz.title);
    doc.moveDown();

    quiz.questions.forEach((question, index) => {
      doc
        .font("Bold")
        .fontSize(12)
        .text(t("export.question", { number: index + 1, prompt: question.prompt }));
      doc.font("Regular").moveDown(0.3);
      if (question.type === "multiple_choice") {
        question.choices.forEach((choice, i) => {
          doc.text(t("export.choice", { letter: LETTERS[i], choice }), { indent: 18 });
        });
      } else if (question.type === "true_false") {
        doc.text(t("export.trueOrFalse"), { indent: 18 });
      } else {
        doc.text(t("export.answerLine"), { indent: 18 });
      }
      doc.moveDown();
    });

    doc.addPage();
    doc.font("Bold").fontSize(16).text(t("export.answerKey"));
    doc.moveDown();
    quiz.questions.forEach((question, index) => {
      doc
        .font("Bold")
        .fontSize(12)
        .text(t("export.answer", { number: index + 1, answer: formatAnswer(question, t) }));
      if (question.explanation) {
        doc.font("Regular").text(question.explanation, { indent: 18 });
      }
      doc.moveDown(0.5);
    });

    doc.end();
  });
}
