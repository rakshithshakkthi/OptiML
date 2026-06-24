import os
import shutil
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
if SUPABASE_URL:
    SUPABASE_URL = SUPABASE_URL.strip().rstrip("/")
    if SUPABASE_URL.endswith("/rest/v1"):
        SUPABASE_URL = SUPABASE_URL[:-8]
    elif SUPABASE_URL.endswith("rest/v1"):
        SUPABASE_URL = SUPABASE_URL[:-7]
    SUPABASE_URL = SUPABASE_URL.rstrip("/")

SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
if SUPABASE_KEY:
    SUPABASE_KEY = SUPABASE_KEY.strip()

supabase_client = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print(f"Initialized Supabase Storage client with URL: {SUPABASE_URL}")
    except Exception as e:
        print(f"Error initializing Supabase client: {e}")

def upload_file(bucket: str, source_path: str, destination_path: str, mime_type: str = None):
    """
    Uploads a file from source_path to the Supabase Storage bucket.
    If Supabase is not configured, copies it locally as a fallback.
    """
    if supabase_client:
        try:
            with open(source_path, "rb") as f:
                file_options = {"content-type": mime_type} if mime_type else {}
                supabase_client.storage.from_(bucket).upload(
                    path=destination_path,
                    file=f,
                    file_options=file_options
                )
            print(f"Successfully uploaded {source_path} to Supabase bucket '{bucket}' as {destination_path}")
            return True
        except Exception as e:
            # Check if upload failed because file already exists (duplicate key error).
            # If so, attempt to update the file instead.
            try:
                with open(source_path, "rb") as f:
                    supabase_client.storage.from_(bucket).update(
                        path=destination_path,
                        file=f
                    )
                print(f"Successfully updated {source_path} in Supabase bucket '{bucket}' as {destination_path}")
                return True
            except Exception as update_err:
                print(f"Failed uploading/updating to Supabase Storage: {update_err}")
                raise e
    else:
        # Fallback to local copy
        local_dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), bucket, destination_path)
        os.makedirs(os.path.dirname(local_dest), exist_ok=True)
        if os.path.abspath(source_path) != os.path.abspath(local_dest):
            shutil.copy2(source_path, local_dest)
        print(f"Supabase not configured. Saved locally to {local_dest}")
        return True

def download_file(bucket: str, source_path: str, destination_path: str):
    """
    Downloads a file from the Supabase Storage bucket to destination_path.
    If Supabase is not configured, copies it from local fallback.
    """
    if supabase_client:
        try:
            res = supabase_client.storage.from_(bucket).download(source_path)
            os.makedirs(os.path.dirname(destination_path), exist_ok=True)
            with open(destination_path, "wb") as f:
                f.write(res)
            print(f"Successfully downloaded {source_path} from Supabase bucket '{bucket}' to {destination_path}")
            return True
        except Exception as e:
            print(f"Failed downloading from Supabase Storage: {e}")
            raise e
    else:
        # Fallback to local copy
        local_source = os.path.join(os.path.dirname(os.path.abspath(__file__)), bucket, source_path)
        if os.path.exists(local_source):
            os.makedirs(os.path.dirname(destination_path), exist_ok=True)
            if os.path.abspath(local_source) != os.path.abspath(destination_path):
                shutil.copy2(local_source, destination_path)
            print(f"Supabase not configured. Read locally from {local_source}")
            return True
        else:
            raise FileNotFoundError(f"Local fallback file not found: {local_source}")

def delete_file(bucket: str, path: str):
    """
    Deletes a file from the Supabase Storage bucket.
    If Supabase is not configured, deletes from local fallback.
    """
    if supabase_client:
        try:
            supabase_client.storage.from_(bucket).remove([path])
            print(f"Successfully deleted {path} from Supabase bucket '{bucket}'")
            return True
        except Exception as e:
            print(f"Failed deleting from Supabase Storage: {e}")
            return False
    else:
        # Fallback to local delete
        local_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), bucket, path)
        if os.path.exists(local_file):
            os.remove(local_file)
            print(f"Supabase not configured. Deleted locally: {local_file}")
            return True
        return False

def get_file_bytes(bucket: str, path: str) -> bytes:
    """
    Downloads a file from the Supabase Storage bucket and returns its raw bytes.
    If Supabase is not configured, reads from local fallback.
    """
    if supabase_client:
        try:
            return supabase_client.storage.from_(bucket).download(path)
        except Exception as e:
            print(f"Failed to get file bytes from Supabase: {e}")
            raise e
    else:
        local_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), bucket, path)
        if os.path.exists(local_file):
            with open(local_file, "rb") as f:
                return f.read()
        else:
            raise FileNotFoundError(f"Local fallback file not found: {local_file}")
