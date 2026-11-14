# QuizQrafter

Users upload study material and get a quiz written from it by AI.

## Language

### Quiz jobs

**Quiz job**:
One request to read a Document and write its Quiz, from the moment it is asked for until it succeeds or fails.
_Avoid_: Task, generation

**Active**:
A Quiz job that is queued or running, i.e. still in progress. Only active Quiz jobs count against a user's limit.
_Avoid_: Pending, open

**Run**:
One attempt by a worker to carry out a Quiz job. When a worker stalls, a new Run takes over, and only the newest Run may record anything.
_Avoid_: Claim, attempt, execution

**Final run**:
The Run after which a Quiz job that fails for a reason that might pass is not tried again.
_Avoid_: Last attempt

**Stage**:
Which step a running Quiz job is on: reading the Document or writing the Quiz.
_Avoid_: Step, phase
