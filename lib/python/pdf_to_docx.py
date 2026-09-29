"""PDF -> DOCX with real paragraphs and tables (pdf2docx), used by app/api/convert.

Usage: pdf_to_docx.py <input.pdf> <output.docx>
Exit code 2 = the PDF is password-protected.
"""
import logging
import sys

logging.disable(logging.WARNING)

import pymupdf  # noqa: E402  (installed with pdf2docx)
from pdf2docx import Converter  # noqa: E402


def main():
    src, dst = sys.argv[1], sys.argv[2]
    with pymupdf.open(src) as doc:
        if doc.needs_pass:
            print("encrypted", file=sys.stderr)
            sys.exit(2)
    cv = Converter(src)
    try:
        cv.convert(dst)
    finally:
        cv.close()


if __name__ == "__main__":
    main()
