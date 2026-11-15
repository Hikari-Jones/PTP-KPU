from langchain_ollama.llms import OllamaLLM
from langchain_core.prompts import ChatPromptTemplate
from vector import retriever

model= OllamaLLM(model="yxchia/qwen2.5-3b-instruct:Q4_K_M")

template = """
Anda bertugas membantu menjawab pertanyaan seputar proyek PTP-KPU.
Anda akan diberikan pertanyaan dan harus menjawabnya berdasarkan informasi yang tersedia dalam dokumentasi proyek.
Jika jawabannya tidak tersedia, berikan tanggapan "Saya tidak tahu".

Ini adalah review yang relevan: {review}

Ini adalah pertanyaan yang diajukan: {question}
"""

prompt = ChatPromptTemplate.from_template(template)
chain = prompt | model

while True:
    print("\n\n----------------------")
    question = input("Masukkan pertanyaan Anda: ")
    print("Memproses pertanyaan Anda...")
    if question == "keluar":
        break

result = chain.invoke({
    "review": "[]",
    "question": question
}) 

print(result)
