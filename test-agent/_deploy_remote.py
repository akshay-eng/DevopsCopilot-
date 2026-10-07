import os
import sys
import paramiko

HOST = "172.17.204.5"
USER = "ubuntu"
PASS = "Wipro@123"
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "_deploy")
REMOTE_DIR = "/home/ubuntu/devops-copilot-agentops"


def main():
    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=PASS)
    sftp = paramiko.SFTPClient.from_transport(transport)

    def mkdirs(remote_path):
        parts = remote_path.strip("/").split("/")
        cur = ""
        for part in parts:
            cur += "/" + part
            try:
                sftp.mkdir(cur)
            except IOError:
                pass

    mkdirs(REMOTE_DIR)

    for root, dirs, files in os.walk(LOCAL_DIR):
        rel = os.path.relpath(root, LOCAL_DIR).replace("\\", "/")
        remote_root = REMOTE_DIR if rel == "." else f"{REMOTE_DIR}/{rel}"
        mkdirs(remote_root)
        for f in files:
            local_path = os.path.join(root, f)
            remote_path = f"{remote_root}/{f}"
            sftp.put(local_path, remote_path)
            print("uploaded", remote_path)

    sftp.close()
    transport.close()
    print("DONE")


if __name__ == "__main__":
    main()
