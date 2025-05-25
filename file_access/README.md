>[!NOTE]
> This skill will only work on AnythingLLM Desktop - not the web app/docker version.

## Save File to Location

This is an agent skill for AnythingLLM that allows you to save/read files to/from a specific location on your computer.
If the folder is in the Allowed array in handlers.js
## Setup

1. Install the package by using its import ID from the AnythingLLM Community Hub and pasting that into the "Import ID" field in the AnythingLLM app.
2. Activate the skill by clicking the toggle button in the AnythingLLM app under the "Agent Skills" section.

## Usage

Once installed, you can ask the AnythingLLM app via `@agent` to save a file to a specific location on your computer using natural language.
You have to change the allowed folders array in handler.js.
~~~
@agent save the file "my-file.txt" to the "Documents" folder
@agent read the file "my-file.txt" from the "Documents" folder
~~~

Sometimes you may need to specify the full path to the folder you want to save the file to.

~~~
@agent save the file "my-file.txt" to "/Users/john/Documents"
@agent read the file "my-file.txt" from "/Users/john/Documents"
//or on Windows:
@agent save the file "my-file.txt" to "C:\Users\john\Documents"
@agent read the file "my-file.txt" from "C:\Users\john\Documents"
~~~

