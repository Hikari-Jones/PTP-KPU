from langchain_ollama import OllamaEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document
import os
import pandas as pd

df = pd.read_csv("data/*.csv")
embeddings = OllamaEmbeddings(model="mxbai-embed-large:latest ")

db_location = "./chrome_langchain_db"
add_documents = not os.path.exists(db_location)

if add_documents:
    documents = []
    ids = []

    for i, row in df.iterrows():
        document = Document(
            page_content=row["content"],
            metadata={
                "id": row["id"],
                "title": row["title"],
                "author": row["author"],
                "date": row["date"],
                "source": row["source"],
            },
            id=str(i))
        ids.append(str(i))
        documents.append(document)


    db = Chroma.from_documents(documents, embeddings, persist_directory=db_location)
    db.persist()