import os
import voyageai

# voyage-3-lite: fast, cheap, 512 dimensions — good fit for memory retrieval
_MODEL = "voyage-3-lite"

_client: voyageai.Client | None = None


def _get_client() -> voyageai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("VOYAGE_SECRET_KEY")
        if not api_key:
            raise RuntimeError(
                "VOYAGE_SECRET_KEY is not set. Add it to your .env file."
            )
        _client = voyageai.Client(api_key=api_key)
    return _client


def get_embedding(text: str) -> list[float]:
    """Embed a single string. Returns a 1024-dimensional float vector."""
    text = text.strip()
    if not text:
        raise ValueError("Cannot embed empty text.")
    result = _get_client().embed([text], model=_MODEL, input_type="document")
    return result.embeddings[0]


def get_query_embedding(text: str) -> list[float]:
    """Embed a query string (optimised for retrieval, not storage).

    Use this when embedding the user's message before searching memories.
    Use get_embedding() when storing a new memory.
    """
    text = text.strip()
    if not text:
        raise ValueError("Cannot embed empty text.")
    result = _get_client().embed([text], model=_MODEL, input_type="query")
    return result.embeddings[0]


def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Embed multiple strings in one API call. More efficient than looping get_embedding()."""
    texts = [t.strip() for t in texts if t.strip()]
    if not texts:
        return []
    result = _get_client().embed(texts, model=_MODEL, input_type="document")
    return result.embeddings
