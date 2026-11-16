"""Run the model without the backend.

    python -m kirana_llm "Buatkan draf nota dinas"   # one question
    python -m kirana_llm                              # interactive chat
    python -m kirana_llm --download                   # only fetch the weights
    python -m kirana_llm --status                     # is it downloaded?
"""

import argparse

from . import config, model

DEFAULT_SYSTEM = (
    "Anda adalah KIRANA, asisten AI yang membantu dan menjawab dalam bahasa "
    "Indonesia yang jelas."
)


def _answer(messages) -> str:
    """Print the answer while it is generated and return it."""
    parts = []
    for piece in model.stream_chat(messages):
        print(piece, end="", flush=True)
        parts.append(piece)
    print()
    return "".join(parts).strip()


def main() -> None:
    parser = argparse.ArgumentParser(prog="kirana_llm", description=__doc__.split("\n")[0])
    parser.add_argument("prompt", nargs="*", help="question; omit for interactive mode")
    parser.add_argument("--system", default=DEFAULT_SYSTEM, help="system prompt")
    parser.add_argument("--download", action="store_true", help="download the model and exit")
    parser.add_argument("--status", action="store_true", help="show model status and exit")
    args = parser.parse_args()

    if args.status:
        path = model.downloaded_path()
        print(f"model : {config.MODEL_PATH or f'{config.MODEL_REPO}/{config.MODEL_FILE}'}")
        print(f"status: {'downloaded at ' + path if path else 'not downloaded'}")
        return
    if args.download:
        print(model.ensure_model())
        return
    if args.prompt:
        _answer(model.build_messages(" ".join(args.prompt), system=args.system))
        return

    print("KIRANA lokal. Ketik 'keluar' untuk berhenti.")
    history = []
    while True:
        try:
            question = input("\nAnda: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if question.lower() == "keluar":
            break
        if not question:
            continue
        print("\nKIRANA: ", end="", flush=True)
        answer = _answer(model.build_messages(question, system=args.system, history=history))
        history += [
            {"role": "user", "content": question},
            {"role": "assistant", "content": answer},
        ]


if __name__ == "__main__":
    main()
