# Blue Sky Vision

The purpose of this app is to support me personally in staying focused and inspired in my day-to-day life.

## Problems I Face

One of the big problems I face is getting momentum in the morning.

One contributor to this problem is that I have a wide variety of goals at any given time, and I worry about forgetting about any given goal or value in my life even if it's not my priority to work on in the moment.

To this end, I want to have structured data that represents my thoughts which is accessible in the interface for me to verify that everything is there.

*feature note*: the purely linear view of value/goal/project/task doesn't represent this as clearly and compactly as possible. I should consider various visual designs and see what's appealing, ideally designs should be able to dynamically shift depending on whether the context is clearly tree-like (e.g. many tasks within one project) or has a different shape (e.g. playtesting various monsters in my board game, where there are many items at different points in a playtest cycle of write -> test -> analyze -> rewrite).

Another problem is getting to practical next steps and prioritizing between them.

Another problem is remembering time-based tasks, including very basic recurring tasks like remembering to eat meals and clean the house and play with the cats, as well as deadlines.

Another problem is social anxiety when tasks involve reaching out to people individually.

Another problem is maintaining my focus and recording my progress on tasks in a central, retrievable location when that progress is often of highly variable form. For example, designing board game monsters involves choosing a mythological or fictional source of inspiration, drawing drafts of how I can physically represent the creature, translating those drawings into CAD, adjusting the CAD model to be 3D printable, debugging problems with the 3D print, assigning rules and behaviors for the creature, playtesting with it, and often iterating on the model itself so that it better supports the play mechanics. This involves pencil drawings on paper, CAD models, printing delays, physically investigating the prints, typing up rules docs, gathering people to playtest the creature, all back and forth repeatedly.

Another problem is depression, which sometimes means I need to take a break to complain about the task I'm working on. This contributes to a technical problem with LLMs where how clean the context is is important for getting good results. 

*feature note*: Most or even all of the LLM modalities used in the app should have some method for cleaning up the context they use. The central app, the day planner, has access to a lot of granular information about a lot of tasks, but most of these are not relevant most of the time. Even some text while actively working on a task is not necessary for that task, and can be removed from context--but I would prefer not to ignore or delete it entirely! Since usually that text will be relevant to some other facet of life or conversation. Possibly a separate thread should search for a different part of the mind map (possibly within the current value/goal/project/task hierarchy but not necessarily!) in which the text is relevant.
Even for one-off snide remarks, I would expect that some kind of counter of how often these occur could be used for tracking "current mood", without them neededing to show up in the context of doing work on a specific task.

*feature note*: More prompts should get imported from various other projects (but especially humanlayer as an example) to help specialize LLM performance depending on the context in which the LLM is working. A first step on this feature would be to simply retrieve the humanlayer git repo (which I do think is already downloaded locally) and examine the structure of how it uses its prompts.

*feature note*: the Gemini API key should be stored on device so I don't have to enter it every time I switch away from Google models and back, similarly for Claude. Ollama doesn't use an API key but similarly model source switching should be seamless.

*feature note*: a login mechanism would be nice to have, and could help with storing API keys, encrypting separate private data for different users (e.g. so my partner can use the app on my computer) and would lock down enough of the app for me to feel comfortable exposing it online, not only on LAN

*feature note*: I'd like to be able to index documents for RAG-style access. I want to avoid using a vector store, and instead investigate ways of having LLMs do close readings of a document, ideally splitting recursively by small numbers of natural sections with summaries of contents similar to a table of contents at each level, and generating thoughts while going through the process of "reading" and processing the document into this form in the first place, with those thoughts similarly indexed tree-like and linked to the text that inspired them.

