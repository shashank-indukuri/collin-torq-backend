"""Extract evidence from a downloaded PDF, without invoking a model."""
import json
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1], strict=False)
if reader.is_encrypted:
    raise ValueError('Encrypted guides are unsupported')
if len(reader.pages) > 100:
    raise ValueError('Guide exceeds 100-page local demo limit')
print(json.dumps({'pages': [{'page': i + 1, 'text': p.extract_text() or ''} for i, p in enumerate(reader.pages)]}))
