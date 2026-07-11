import os
import zipfile

def create_zip_archive():
    source_dir = r"c:\Users\shinywos\Desktop\migration_v2.0.10"
    output_filename = r"c:\Users\shinywos\Desktop\migration_v2.0.11.zip"
    
    print(f"Iniciando compresión de: {source_dir}")
    print(f"Destino: {output_filename}")
    
    # Directorios a excluir de la compresión
    exclude_dirs = {'.git', 'venv', '__pycache__'}
    
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            # Filtrar directorios excluidos in-place
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            for file in files:
                # Evitar comprimir archivos .pyc o .db locales grandes si es necesario,
                # pero mantendremos bases de datos sembradas y archivos principales.
                if file.endswith('.pyc') or file == 'migration_v2.0.11.zip':
                    continue
                
                full_path = os.path.join(root, file)
                # Ruta relativa dentro del ZIP
                relative_path = os.path.relpath(full_path, source_dir)
                
                print(f"  Agregando: {relative_path}")
                zipf.write(full_path, relative_path)
                
    print("\n¡Compresión completada con éxito!")

if __name__ == "__main__":
    create_zip_archive()
