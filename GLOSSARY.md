# QuizQrafter

Users upload study material and get a quiz written from it by AI.

## Language

### Jobs

**Job**:
Work a worker does in the background, from the moment it is asked for until it succeeds or fails. Each Job is of one kind, named for what it does, such as a GenerateQuizJob.
_Avoid_: Task, background task

**Active**:
A Job that is queued or running, i.e. still in progress.
_Avoid_: Pending, open

**Run**:
One attempt by a worker to carry out a Job. When a worker stalls, a new Run takes over, and only the newest Run may record anything.
_Avoid_: Claim, attempt, execution

**Final run**:
The Run after which a Job that fails for a reason that might pass is not tried again.
_Avoid_: Last attempt

### Generating quizzes

**GenerateQuizJob**:
The kind of Job that reads a Document and writes its Quiz. Only Active GenerateQuizJobs count against a user's limit.
_Avoid_: Quiz job, generation

**Stage**:
Which step a running GenerateQuizJob is on: reading the Document or writing the Quiz.
_Avoid_: Step, phase
