import os
from pathlib import Path

def convert_apple2_text(input_dir, output_dir):
    # Ensure the output directory exists, create it if it doesn't
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Find all files ending in .s in the input directory (case-insensitive)
    source_files = [f for f in Path(input_dir).iterdir() if f.is_file() and f.suffix.lower() == '.s']
    
    if not source_files:
        print(f"No .s files found in {input_dir}")
        return

    print(f"Found {len(source_files)} files. Starting conversion...\n")

    for file_path in source_files:
        try:
            # Read the raw Apple II binary data
            with open(file_path, 'rb') as f:
                raw_bytes = f.read()

            converted_bytes = bytearray()
            
            for b in raw_bytes:
                # Strip the high bit from each byte
                stripped_byte = b & 0x7F 
                
                # Convert Apple II Carriage Return (0x0D) to modern Line Feed (0x0A)
                if stripped_byte == 0x0D:
                    converted_bytes.append(0x0A)
                # Optional: Filter out NULL bytes or weird control characters if needed
                elif stripped_byte >= 0x20 or stripped_byte in (0x09, 0x0A): 
                    converted_bytes.append(stripped_byte)

            # Create the new filename and output path
            new_filename = file_path.stem + '.txt'
            output_path = Path(output_dir) / new_filename

            # Write the modernized ASCII data
            with open(output_path, 'wb') as f:
                f.write(converted_bytes)

            print(f"Success: {file_path.name} -> {new_filename}")

        except Exception as e:
            print(f"Error processing {file_path.name}: {e}")

    print("\nConversion complete!")

# --- Configuration ---
# Change these paths to match where your files actually are. 
# You can use relative paths (like below) or absolute paths (like 'C:/BBS/Source').

SOURCE_FOLDER = 'SpacerQuest/Decompile/Source-ACOS' 
DESTINATION_FOLDER = 'SpacerQuest/Decompile/ACOS-Text'

if __name__ == '__main__':
    convert_apple2_text(SOURCE_FOLDER, DESTINATION_FOLDER)