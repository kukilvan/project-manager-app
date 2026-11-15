# Builds SKILL.md (the skill for Claude) from skill_head.md + library.md; tohnit.py itself is not inserted
import os
d = os.path.dirname(os.path.abspath(__file__))
head = open(os.path.join(d, 'skill_head.md')).read()
import re; lib = re.sub(r'^## (?!Библиотека)', '### ', open(os.path.join(d, 'library.md')).read().replace('# Библиотека обозначений на тохнитах (слаботочка, Израиль)', '## Библиотека обозначений'), flags=re.M)
code = open(os.path.join(d, 'tohnit.py')).read()
open(os.path.join(d, 'SKILL.md'), 'w').write(head + '\n' + lib)  # the script itself is downloaded from GitHub (or attached), it is not inserted into the skill
print('SKILL.md собран')
